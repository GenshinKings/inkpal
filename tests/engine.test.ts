import { describe, expect, it } from "vitest";
import { parseSseIncrement, LlmError } from "../engine/llm.ts";
import { buildQaMessages, buildQaUserMessage, buildRewriteMessages } from "../engine/context.ts";
import { buildAssistMessages } from "../engine/assist.ts";
import { runQa, NO_RESULT_ANSWER } from "../engine/qa.ts";
import type { Hit, LlmConfig, NoteSection } from "../engine/types.ts";

const cfg: LlmConfig = { baseUrl: "https://example.invalid", apiKey: "k", model: "m" };

describe("parseSseIncrement", () => {
  it("解析完整 data 行并累计内容", () => {
    const out: string[] = [];
    const r = parseSseIncrement('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\n', t => out.push(t));
    expect(r.content).toBe("你好");
    expect(out).toEqual(["你", "好"]);
    expect(r.rest).toBe("");
  });
  it("[DONE] 与注释行跳过", () => {
    const r = parseSseIncrement('data: [DONE]\n: keep-alive\n\n', () => {});
    expect(r.content).toBe("");
  });
  it("半行缓冲进 rest", () => {
    const r1 = parseSseIncrement('data: {"choices":[{"delta":{"content":"a"}}]}\ndata: {"ch', () => {});
    expect(r1.content).toBe("a");
    expect(r1.rest).toBe('data: {"ch');
    const r2 = parseSseIncrement(r1.rest + 'oices":[{"delta":{"content":"b"}}]}\n\n', () => {});
    expect(r2.content).toBe("b");
  });
});

describe("提示词拼装", () => {
  const section: NoteSection = { path: "a/b.md", title: "b", heading: "## x", content: "内容", mtime: 1 };
  const hit: Hit = { section, score: 1 };

  it("问答消息：编号块与系统规则", () => {
    const msgs = buildQaMessages([{ role: "user", content: "第一问" }], "第二问", [hit]);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("[n]");
    expect(msgs[msgs.length - 1].content).toContain("[1] 《a/b.md》");
    expect(msgs[msgs.length - 1].content).toContain("## x");
    expect(msgs[msgs.length - 1].content).toContain("【问题】\n第二问");
  });

  it("改写消息：包含历史与当前追问", () => {
    const msgs = buildRewriteMessages(
      [{ role: "user", content: "先问了 A" }, { role: "assistant", content: "答了 A" }],
      "它怎么配的？",
    );
    expect(msgs[1].content).toContain("先问了 A");
    expect(msgs[1].content).toContain("它怎么配的？");
  });

  it("写作消息：要求只输出结果本身", () => {
    const msgs = buildAssistMessages("summarize", "长文本");
    expect(msgs[0].content).toContain("只输出处理结果本身");
    expect(msgs[1].content).toContain("【文本】\n长文本");
  });
});

describe("runQa", () => {
  const section: NoteSection = { path: "方法/番茄.md", title: "番茄", heading: "", content: "专注 25 分钟", mtime: 1 };
  const retriever = {
    retrieve: async (query: string, _k: number) => {
      if (query.includes("番茄")) return [{ section, score: 1 } as Hit];
      return [];
    },
  };

  it("零命中走幻觉闸门，不调用 LLM", async () => {
    let called = 0;
    const result = await runQa(retriever, cfg, [], "量子退相干", 6, async () => {
      called++;
      return "x";
    });
    expect(called).toBe(0);
    expect(result.answer).toBe(NO_RESULT_ANSWER);
    expect(result.hits).toEqual([]);
  });

  it("首问：直接检索并引用作答", async () => {
    const result = await runQa(retriever, cfg, [], "番茄专注多久？", 6, async (_c, msgs) => {
      expect(msgs[msgs.length - 1].content).toContain("[1] 《方法/番茄.md》");
      return "每次专注 25 分钟 [1]";
    });
    expect(result.answer).toContain("[1]");
    expect(result.rewritten).toBe(false);
  });

  it("追问：先改写再检索，改写查询进入检索器", async () => {
    const queries: string[] = [];
    const spyRetriever = {
      retrieve: async (query: string, k: number) => {
        queries.push(query);
        return retriever.retrieve(query, k);
      },
    };
    const result = await runQa(spyRetriever, cfg, [{ role: "user", content: "什么是番茄工作法" }], "它专注多久？", 6, async (_c, msgs) => {
      if (msgs[0].content.includes("检索查询")) return "番茄工作法专注时长";
      return "25 分钟 [1]";
    });
    expect(queries[0]).toBe("番茄工作法专注时长");
    expect(result.rewritten).toBe(true);
    expect(result.answer).toContain("[1]");
  });

  it("改写失败时回退原始问题", async () => {
    let first = true;
    const result = await runQa(retriever, cfg, [{ role: "user", content: "什么是番茄工作法" }], "番茄专注多久？", 6, async () => {
      if (first) {
        first = false;
        throw new LlmError("boom", 500);
      }
      return "25 分钟 [1]";
    });
    expect(result.usedQuery).toBe("番茄专注多久？");
    expect(result.answer).toContain("25 分钟");
  });
});
