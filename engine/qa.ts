// engine/qa.ts — 问答管线：指代消解改写 → 检索 → 引用作答。
// 幻觉闸门：检索零命中时直接返回「没有找到」，不调用 LLM。
import type { Hit, LlmConfig, Retriever } from "./types.ts";
import { buildQaMessages, buildRewriteMessages, type QaTurn } from "./context.ts";
import { chatComplete } from "./llm.ts";

export type { QaTurn };

export const NO_RESULT_ANSWER =
  "你的笔记里没有找到相关内容。试着换几个关键词，或者用笔记里出现过的说法再问一次。";

export interface QaResult {
  answer: string;
  hits: Hit[];
  /** 实际用于检索的查询（多轮时可能是改写后的） */
  usedQuery: string;
  rewritten: boolean;
}

export type LlmCaller = typeof chatComplete;

function normalizeRewrite(out: string, fallback: string): string {
  const cleaned = out
    .trim()
    .replace(/^["'「『]/, "")
    .replace(/["'」』]$/, "")
    .trim();
  return cleaned.length > 0 && cleaned.length <= 200 ? cleaned : fallback;
}

export async function runQa(
  retriever: Retriever,
  cfg: LlmConfig,
  history: QaTurn[],
  question: string,
  k = 6,
  callLlm: LlmCaller = chatComplete,
): Promise<QaResult> {
  let usedQuery = question;
  let rewritten = false;
  if (history.length > 0) {
    try {
      const out = await callLlm(cfg, buildRewriteMessages(history, question), { temperature: 0 });
      usedQuery = normalizeRewrite(out, question);
      rewritten = usedQuery !== question;
    } catch {
      usedQuery = question;
    }
  }

  const hits = await retriever.retrieve(usedQuery, k);
  if (hits.length === 0) {
    return { answer: NO_RESULT_ANSWER, hits, usedQuery, rewritten };
  }

  const answer = await callLlm(cfg, buildQaMessages(history, question, hits), {});
  return { answer, hits, usedQuery, rewritten };
}
