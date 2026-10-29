// engine/types.ts — InkPal 引擎共享类型。引擎层禁止 import 'obsidian'。

export interface LlmConfig {
  /** OpenAI 兼容服务地址，如 https://open.bigmodel.cn/api/paas/v4 */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** 一篇笔记按标题切出的一个片段 */
export interface NoteSection {
  /** vault 相对路径，如 "方法/番茄工作法.md" */
  path: string;
  /** 笔记标题：首个一级标题，缺省取文件名 */
  title: string;
  /** 标题面包屑，如 "# 番茄工作法 > ## 时长"；无标题前导内容为 "" */
  heading: string;
  content: string;
  mtime: number;
}

export interface Hit {
  section: NoteSection;
  score: number;
}

/** 检索器接口：v1 用关键词实现，v1.1 可替换为向量实现，调用方不变 */
export interface Retriever {
  retrieve(query: string, k: number): Promise<Hit[]>;
}
