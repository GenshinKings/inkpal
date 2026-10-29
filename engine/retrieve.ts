// engine/retrieve.ts — 关键词检索器：中文 bigram + 英文词元 + IDF 加权 + 字面短语加分。
// v1 无嵌入、无模型下载；Retriever 接口保持稳定，v1.1 可插入向量实现。
// 注意：本文件会被 Node 直接运行的脚本加载，只使用可擦除 TS 语法（无参数属性/枚举）。
import type { Hit, NoteSection, Retriever } from "./types.ts";

/** 泛词 bigram：只被它们命中不算覆盖（防「XX的问题」这类尾部泛词骗过闸门） */
const GENERIC_BIGRAMS = new Set([
  "问题", "什么", "时候", "如何", "怎么", "使用", "进行", "以及", "还有",
  "这个", "那个", "一个", "自己", "没有", "就是", "还是", "可以", "这样",
  "那样", "其他", "其它", "关于", "部分", "内容", "一下", "因为", "所以",
  "但是", "如果", "开始", "继续", "直接", "需要", "应该",
]);

/** 提取查询词元（扁平列表）：CJK 连续段切 bigram（单字成段保留单字），拉丁段取整词 */
export function tokenizeQuery(query: string): string[] {
  const terms = new Set<string>();
  for (const run of query.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) ?? []) {
    if (run.length === 1) {
      terms.add(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
  }
  const latin = query.toLowerCase().match(/[a-z0-9][a-z0-9_\-']*/g) ?? [];
  for (const w of latin) if (w.length > 1) terms.add(w);
  return [...terms];
}

interface QueryUnit {
  /** 单元内的词元：CJK 连续段的所有 bigram，或一个拉丁词 */
  terms: string[];
  /** 拉丁词单元无泛词问题；CJK 单元必须至少命中一个非泛词 bigram 才算覆盖 */
  latin: boolean;
}

function buildUnits(query: string): QueryUnit[] {
  const units: QueryUnit[] = [];
  for (const run of query.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) ?? []) {
    const terms: string[] = [];
    if (run.length === 1) terms.push(run);
    else for (let i = 0; i < run.length - 1; i++) terms.push(run.slice(i, i + 2));
    units.push({ terms, latin: false });
  }
  for (const w of query.toLowerCase().match(/[a-z0-9][a-z0-9_\-']*/g) ?? []) {
    if (w.length > 1) units.push({ terms: [w], latin: true });
  }
  return units;
}

function countOccurrences(haystack: string, needle: string, cap = 8): number {
  let count = 0;
  let idx = 0;
  while (count < cap && (idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export interface KeywordSearchOptions {
  /** 命中查询单元的 IDF 权重占「库内存在单元总 IDF」的最低比例，低于此判为不相关（幻觉闸门） */
  minCoverage?: number;
}

export function keywordSearch(
  sections: NoteSection[],
  query: string,
  k: number,
  opts?: KeywordSearchOptions,
): Hit[] {
  const minCoverage = opts?.minCoverage ?? 0.4;
  const units = buildUnits(query);
  if (units.length === 0) return [];

  const N = sections.length;
  const docs = sections.map(s => ({
    section: s,
    full: (s.heading + "\n" + s.path + "\n" + s.title + "\n" + s.content).toLowerCase(),
    head: (s.heading + "\n" + s.title).toLowerCase(),
    path: s.path.toLowerCase(),
  }));

  // 文档频率只统计「库内至少出现一次」的词元：查询里凭空造出的说法不参与打分
  const df = new Map<string, number>();
  const allTerms = new Set<string>();
  for (const u of units) for (const t of u.terms) allTerms.add(t);
  for (const t of allTerms) {
    let n = 0;
    for (const d of docs) if (d.full.includes(t)) n++;
    if (n > 0) df.set(t, n);
  }
  const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) ?? 0)));
  /** 单元 IDF = 其库内存在词元的最大 IDF（最稀有的 bigram 代表该单元） */
  const unitIdf = (u: QueryUnit): number => {
    let m = 0;
    for (const t of u.terms) if (df.has(t)) m = Math.max(m, idf(t));
    return m;
  };
  const existingUnits = units.filter(u => u.terms.some(t => df.has(t)));
  if (existingUnits.length === 0) return [];
  const totalIdf = existingUnits.reduce((a, u) => a + unitIdf(u), 0);

  const qLower = query.trim().toLowerCase();
  const hits: Hit[] = [];

  for (const d of docs) {
    let coveredIdf = 0;
    let weighted = 0;
    for (const u of existingUnits) {
      const inCorpus = u.terms.filter(t => df.has(t));
      const inDoc = inCorpus.filter(t => d.full.includes(t));
      if (inDoc.length === 0) continue;
      // CJK 单元必须命中至少一个非泛词 bigram，否则该单元对本片段不算覆盖
      const contentHits = u.latin ? inDoc : inDoc.filter(t => !GENERIC_BIGRAMS.has(t));
      if (contentHits.length === 0) continue;
      coveredIdf += unitIdf(u);
      for (const t of contentHits) {
        let field = 1;
        if (d.head.includes(t)) field = 3;
        else if (d.path.includes(t)) field = 2;
        weighted += Math.min(countOccurrences(d.full, t), 4) * idf(t) * field;
      }
    }
    if (coveredIdf === 0) continue;
    const coverage = coveredIdf / totalIdf;
    if (coverage < minCoverage) continue;
    if (qLower.length >= 4 && d.full.includes(qLower)) weighted += 8;
    hits.push({ section: d.section, score: coverage * 10 + weighted / (totalIdf * 4) });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

export class KeywordRetriever implements Retriever {
  private readonly getSections: () => Promise<NoteSection[]>;
  private readonly options?: KeywordSearchOptions;

  constructor(getSections: () => Promise<NoteSection[]>, options?: KeywordSearchOptions) {
    this.getSections = getSections;
    this.options = options;
  }

  async retrieve(query: string, k: number): Promise<Hit[]> {
    return keywordSearch(await this.getSections(), query, k, this.options);
  }
}
