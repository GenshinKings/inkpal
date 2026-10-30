import { requestUrl } from "obsidian";
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
 * 为什么用 requestUrl 而不是 fetch：Obsidian 的渲染进程有 CORS 限制，
 * 直连 localhost 会被浏览器安全策略拦成「Failed to fetch」。requestUrl 走主进程，不受同源限制。
 *
 * 契约（voyage 侧 /api/inkpal/chat）：
 *   请求 {messages:[{role,content}]} → 响应 {reply, sharedTutor:true}
 * voyage 不支持流式，这里一次性回放：先 onToken(全文)，再返回。
 */
export function voyageCaller(voyageUrl: string): typeof chatComplete {
  const base = voyageUrl.trim().replace(/\/+$/, "");
  return async (_cfg: LlmConfig, msgs: ChatMessage[], opts: ChatOptions = {}): Promise<string> => {
    const res = await requestUrl({
      url: base + "/api/inkpal/chat",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ messages: msgs.map(m => ({ role: m.role, content: m.content })) }),
      throw: false,
    });
    if (res.status >= 400) {
      const text = typeof res.text === "string" ? res.text : "";
      throw new Error("voyage 助教返回 " + res.status + (text ? "：" + text.slice(0, 160) : ""));
    }
    const data = res.json as { reply?: string };
    const reply = (data && data.reply) || "";
    if (opts.onToken) opts.onToken(reply);
    return reply;
  };
}

/** 拿一个既能走 voyage、也能走自带模型配置的调用器。 */
export function makeCaller(voyageUrl: string): typeof chatComplete {
  const url = (voyageUrl || "").trim();
  if (url) return voyageCaller(url);
  return chatComplete;
}
