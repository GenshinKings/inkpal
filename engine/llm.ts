// engine/llm.ts — OpenAI 兼容 chat/completions 客户端：非流式 + SSE 流式，重试与超时。零依赖。
import type { ChatMessage, LlmConfig } from "./types.ts";

export class LlmError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 提供即走流式，增量 token 回调 */
  onToken?: (token: string) => void;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(cfg: LlmConfig, body: unknown, opts: ChatOptions): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new LlmError("请求超时")),
      opts.timeoutMs ?? cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const onOuterAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
    try {
      const res = await fetch(joinUrl(cfg.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return res;
      const text = await res.text().catch(() => "");
      const err = new LlmError(`LLM 服务错误 ${res.status}：${text.slice(0, 300)}`, res.status);
      if (res.status === 429 || res.status >= 500) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      throw err;
    } catch (e) {
      // 不可重试的业务错误（401/400 等）直接抛出
      if (e instanceof LlmError && e.status !== undefined && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      throw lastErr instanceof Error ? lastErr : new LlmError(String(lastErr));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new LlmError("LLM 请求失败");
}

/**
 * 增量解析一段 SSE 文本中的 data 行 delta。
 * 返回本次解析出的完整 content 与未完结的半行缓冲（rest，需拼回下一轮输入）。
 * 单独导出以便无网络单测。
 */
export function parseSseIncrement(
  buffer: string,
  onToken: (token: string) => void,
): { content: string; rest: string } {
  let content = "";
  let idx: number;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
      const t = json.choices?.[0]?.delta?.content;
      if (t) {
        content += t;
        onToken(t);
      }
    } catch {
      // 忽略无法解析的行（例如服务端心跳注释）
    }
  }
  return { content, rest: buffer };
}

async function streamResponse(res: Response, onToken: (token: string) => void): Promise<string> {
  if (!res.body) throw new LlmError("LLM 流式响应缺少 body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const r = parseSseIncrement(buffer, onToken);
    full += r.content;
    buffer = r.rest;
  }
  if (full.length === 0) throw new LlmError("LLM 流式响应为空");
  return full;
}

export async function chatComplete(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? cfg.temperature ?? 0.7,
    stream: opts.onToken !== undefined,
  };
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  const res = await fetchWithRetry(cfg, body, opts);
  if (opts.onToken) return await streamResponse(res, opts.onToken);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new LlmError("LLM 返回格式异常：缺少 choices[0].message.content");
  return content;
}
