import { describe, expect, it } from "vitest";
import { keywordSearch, tokenizeQuery } from "../engine/retrieve.ts";
import type { NoteSection } from "../engine/types.ts";

function sec(path: string, title: string, content: string, mtime = 1): NoteSection {
  return { path, title, heading: "", content, mtime };
}

describe("tokenizeQuery", () => {
  it("CJK 连续段切 bigram", () => {
    expect(tokenizeQuery("番茄工作法")).toContain("番茄");
    expect(tokenizeQuery("番茄工作法")).toContain("茄工");
    expect(tokenizeQuery("番茄工作法")).toHaveLength(4);
  });
  it("拉丁词取整词并转小写", () => {
    expect(tokenizeQuery("FSRS Scheduling")).toEqual(["fsrs", "scheduling"]);
  });
  it("单字 CJK 保留单字", () => {
    expect(tokenizeQuery("猫")).toEqual(["猫"]);
  });
  it("标点忽略", () => {
    expect(tokenizeQuery("番茄，工作？")).toEqual(["番茄", "工作"]);
  });
});

const corpus = [
  sec("日记/周一.md", "周一", "今天天气很好，散步了半小时。"),
  sec("方法/番茄.md", "番茄工作法", "每次专注 25 分钟，然后休息 5 分钟。用物理计时器记录。"),
  sec("方法/anki.md", "Anki 心得", "FSRS 调度安排复习间隔。Anki 制卡要小而精，一张卡一个知识点。"),
  sec("设计/哥特.md", "哥特萝莉设计", "黑白配色为主，蕾丝装饰在袖口与裙摆。"),
];

describe("keywordSearch", () => {
  it("命中目标笔记且排第一", () => {
    const hits = keywordSearch(corpus, "番茄工作法专注多久？", 3);
    expect(hits[0].section.path).toBe("方法/番茄.md");
  });

  it("标题命中有加分", () => {
    const hits = keywordSearch(corpus, "番茄", 3);
    expect(hits[0].section.path).toBe("方法/番茄.md");
  });

  it("英文词命中", () => {
    const hits = keywordSearch(corpus, "FSRS 是什么调度", 3);
    expect(hits[0].section.path).toBe("方法/anki.md");
  });

  it("幻觉闸门：全库无相关词时返回空", () => {
    expect(keywordSearch(corpus, "量子计算退相干", 3)).toEqual([]);
  });

  it("幻觉闸门：拉丁词全库无命中返回空", () => {
    expect(keywordSearch(corpus, "photosynthesis reactions", 3)).toEqual([]);
  });

  it("返回数不超过 k", () => {
    const hits = keywordSearch(corpus, "方法 休息 记录 复习 设计 配色", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});
