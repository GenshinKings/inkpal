// engine/assist.ts — 写作辅助：摘要/润色/续写/翻译的提示词与执行。
// 原则：补全而不代写——产物以「AI 草稿」呈现，用户确认后才落笔（确认与撤销在 adapter 层）。
import type { ChatMessage, LlmConfig } from "./types.ts";
import { chatComplete } from "./llm.ts";

export type AssistKind = "summarize" | "polish" | "continue" | "translate";

export const ASSIST_LABELS: Record<AssistKind, string> = {
  summarize: "摘要",
  polish: "润色",
  continue: "续写",
  translate: "翻译",
};

const INSTRUCTIONS: Record<AssistKind, string> = {
  summarize:
    "把下面的文本总结成不超过 5 条要点，每条一行，以「- 」开头。保留原文的关键术语与数字，不要添加原文没有的信息。",
  polish:
    "润色下面的文本：修正错别字与语病，让表达更通顺准确。保持原意、人称与格式（标题层级、列表、链接）不变，不要增删内容要点。",
  continue:
    "从文本结尾处自然续写约 100-200 字。延续原文的语气、人称与格式；只输出续写部分，不要重复原文。",
  translate:
    "翻译下面的文本：以中文为主的译成英文，其他语言译成中文。保持格式（标题、列表、代码块）不变；代码、命令与专有名词不译。",
};

export function buildAssistMessages(kind: AssistKind, text: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是写作辅助工具。只输出处理结果本身：不要任何解释或前缀（如「好的，以下是」），不要用代码块包裹整段输出，不要重复任务要求。",
    },
    { role: "user", content: `${INSTRUCTIONS[kind]}\n\n【文本】\n${text}` },
  ];
}

export async function runAssist(
  cfg: LlmConfig,
  kind: AssistKind,
  text: string,
  opts?: { signal?: AbortSignal },
): Promise<string> {
  return chatComplete(cfg, buildAssistMessages(kind, text), {
    temperature: 0.4,
    signal: opts?.signal,
  });
}
