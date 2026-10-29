// engine/context.ts — 提示词拼装（纯函数，可单测）。
import type { ChatMessage, Hit } from "./types.ts";

export interface QaTurn {
  role: "user" | "assistant";
  content: string;
}

export function buildQaSystemPrompt(): string {
  return [
    "你是用户笔记库的问答助手。回答规则：",
    "1. 事实性内容只依据【笔记片段】作答；片段不足以支撑的断言一律不说。",
    "2. 引用格式：句末加 [n]，n 是笔记片段编号；多个来源可写 [1][3]。",
    "3. 笔记片段里没有答案时，回答「你的笔记里没有找到相关内容」并建议换关键词，不要编造。",
    "4. 用用户的语言（默认中文）简洁作答；可以用列表和短段落，但不要长篇大论。",
    "5. 若借用了笔记之外的一般知识，须明确以「笔记里没有，以下是一般知识：」开头说明，且不加 [n] 引用。",
  ].join("\n");
}

export function buildQaUserMessage(question: string, hits: Hit[]): string {
  const blocks = hits.map((h, i) => {
    const head = `[${i + 1}] 《${h.section.path}》${h.section.heading ? " · " + h.section.heading : ""}`;
    return `${head}\n${h.section.content}`;
  });
  return `【笔记片段】\n${blocks.join("\n\n---\n\n")}\n\n【问题】\n${question}`;
}

export function buildQaMessages(
  history: QaTurn[],
  question: string,
  hits: Hit[],
): ChatMessage[] {
  const recent = history.slice(-6);
  return [
    { role: "system", content: buildQaSystemPrompt() },
    ...recent.map(t => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: "user", content: buildQaUserMessage(question, hits) },
  ];
}

export function buildRewriteMessages(history: QaTurn[], question: string): ChatMessage[] {
  const turns = history
    .slice(-6)
    .map(t => `${t.role === "user" ? "用户" : "助手"}：${t.content}`)
    .join("\n");
  return [
    {
      role: "system",
      content:
        "把用户的追问改写成不依赖对话历史的独立检索查询。用上下文补全指代（它/这个/上面说的），保留关键实体。只输出查询本身，不要解释，长度不超过 40 字。",
    },
    { role: "user", content: `【对话历史】\n${turns}\n\n【当前追问】\n${question}` },
  ];
}
