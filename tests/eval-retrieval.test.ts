// 评测关卡：检索 12 例（9 例 gold 命中 + 3 例幻觉闸门）。发布前必须全绿（npm test / scripts/release.sh）。
// 难度带：L1 单篇单段直问 / L2 同篇跨段与标题定位 / L3 跨两篇综合 / L4 全库无答案（闸门）。
import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../engine/chunk.ts";
import { keywordSearch } from "../engine/retrieve.ts";
import type { NoteSection } from "../engine/types.ts";

const NOTES: Record<string, string> = {
  "方法/番茄工作法.md": [
    "# 番茄工作法",
    "",
    "## 基本节奏",
    "每次专注 25 分钟，然后休息 5 分钟，四个循环后长休 15 分钟。",
    "",
    "## 工具",
    "用物理计时器，手机会带来干扰。记录每个番茄的完成情况到日历。",
    "",
    "## 常见误区",
    "休息时间不要刷手机，起来走动更有效。",
  ].join("\n"),

  "学习/anki与fsrs.md": [
    "# Anki 与 FSRS",
    "",
    "## 调度",
    "FSRS 按记忆痕迹难度安排复习间隔，比旧算法更省时间。",
    "",
    "## 制卡原则",
    "Anki 制卡要小而精：一张卡只考一个知识点，问题要能一句话回答。",
    "",
    "## 习惯",
    "每天早上通勤时过一遍到期卡片，上限 20 张，防复习债堆积。",
  ].join("\n"),

  "设计/哥特萝莉设定.md": [
    "# 哥特萝莉设定",
    "",
    "## 配色",
    "黑白双色为主，点缀色不超过一成，用暗红。",
    "",
    "## 元素",
    "蕾丝装饰集中在袖口与裙摆，鞋用厚底。徽章元素 Z 满布全身。",
    "",
    "## 忌讳",
    "避免大面积亮色与卡通印花。",
  ].join("\n"),

  "工作/周报模板.md": [
    "# 周报模板",
    "",
    "## 结构",
    "三段式：本周结果、下周计划、需要的支持。每段不超过三行。",
    "",
    "## 用途",
    "周五下班前发给主管，抄送项目群。",
  ].join("\n"),
};

function buildSections(): NoteSection[] {
  const sections: NoteSection[] = [];
  for (const [path, md] of Object.entries(NOTES)) {
    sections.push(...chunkMarkdown(path, md, 1000));
  }
  return sections;
}

interface EvalCase {
  name: string;
  query: string;
  /** 期望 gold 路径；assert 用 top-k 包含判断 */
  gold: string[];
  k: number;
}

const CASES: EvalCase[] = [
  // L1 单篇单段直问
  { name: "L1 番茄时长", query: "番茄工作法一次专注多少分钟？", gold: ["方法/番茄工作法.md"], k: 3 },
  { name: "L1 FSRS 调度", query: "FSRS 的复习间隔是怎么安排的？", gold: ["学习/anki与fsrs.md"], k: 3 },
  { name: "L1 蕾丝位置", query: "蕾丝装饰用在哪里？", gold: ["设计/哥特萝莉设定.md"], k: 3 },
  { name: "L1 周报结构", query: "周报要写哪几个部分？", gold: ["工作/周报模板.md"], k: 3 },
  // L2 同篇跨段/标题定位
  { name: "L2 休息误区", query: "休息的时候做什么比较好", gold: ["方法/番茄工作法.md"], k: 3 },
  { name: "L2 制卡原则", query: "Anki 制卡有什么原则", gold: ["学习/anki与fsrs.md"], k: 3 },
  // L3 跨两篇综合（两篇都要进 top-k）
  { name: "L3 番茄+Anki 搭配", query: "番茄工作法和 Anki 怎么搭配使用", gold: ["方法/番茄工作法.md", "学习/anki与fsrs.md"], k: 6 },
  { name: "L3 习惯类", query: "每天通勤时间适合做什么", gold: ["学习/anki与fsrs.md"], k: 6 },
  { name: "L3 标题+内容", query: "哥特萝莉的配色忌讳", gold: ["设计/哥特萝莉设定.md"], k: 3 },
  // L4 幻觉闸门：全库无答案，期望零命中（答「没有找到」而非编造）
  { name: "L4 闸门·量子计算", query: "量子计算的退相干问题", gold: [], k: 5 },
  { name: "L4 闸门·护照", query: "如何申请护照", gold: [], k: 5 },
  { name: "L4 闸门·英文", query: "photosynthesis light reactions", gold: [], k: 5 },
];

describe("检索评测关卡（12 例）", () => {
  const sections = buildSections();

  for (const c of CASES) {
    it(c.name, () => {
      const hits = keywordSearch(sections, c.query, c.k);
      const paths = hits.map(h => h.section.path);
      if (c.gold.length === 0) {
        expect(paths, `期望零命中，实际命中 ${JSON.stringify(paths)}`).toEqual([]);
      } else {
        for (const g of c.gold) {
          expect(paths, `gold ${g} 未进 top-${c.k}，实际 ${JSON.stringify(paths)}`).toContain(g);
        }
      }
    });
  }
});
