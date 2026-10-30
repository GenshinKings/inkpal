import type { ChatMessage, LlmConfig } from "../engine/types.ts";
import type { ChatOptions } from "../engine/llm.ts";
import { chatComplete } from "../engine/llm.ts";

/**
 * voyage 桥接：把模型调用交给本地 voyage 的助教。
 *
 * 为什么这么做：插件自带一套 LLM 配置，就会和 voyage 各用各的脑子——
 * 学习者画像、长期记忆、教学法全分裂。接上 voyage 之后两边是同一个助教，
 * 插件只负责读笔记、显示结果。
 *
 * 契约（voyage 侧 /api/inkpal/chat）：
 *   请求 {messages:[{role,content}]} → 响应 {reply, sharedTutor:true}
 * voyage 不支持流式，这里一次性回放：先 onToken(全文)，再返回。
 */
export function voyageCaller(voyageUrl: string): typeof chatComplete {
  const base = voyageUrl.trim().replace(/\/+$/, "");
  return async (cfg: LlmConfig, msgs: ChatMessage[], opts: ChatOptions = {}): Promise<string> => {
    const payload = {
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
    try {
      const res = await fetch(base + "/api/inkpal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: opts.signal ?? controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("voyage 助教返回 " + res.status + (text ? "：" + text.slice(0, 120) : ""));
      }
      const data = (await res.json()) as { reply?: string };
      const reply = data.reply ?? "";
      if (opts.onToken) opts.onToken(reply);
      return reply;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** 拿一个既能走 voyage、也能走自带模型配置的调用器。 */
export function makeCaller(voyageUrl: string): typeof chatComplete {
  const url = (voyageUrl || "").trim();
  if (url) return voyageCaller(url);
  return chatComplete;
}
