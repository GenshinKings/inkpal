// 真实 vault 冒烟：读真实笔记 → 从笔记中部取特征子串作为查询 → 断言目标笔记进 top-3。
// 运行：npm run smoke:vault（Node 24 直接跑 TS）。退出码非 0 = 失败。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chunkMarkdown } from "../engine/chunk.ts";
import { keywordSearch } from "../engine/retrieve.ts";
import type { NoteSection } from "../engine/types.ts";

const VAULT = process.env.INKPAL_VAULT ?? "H:\\Obsidian_WareHouse\\Obsidian_WorkAndStudy";
const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules", ".git", ".smart-env"]);
const MIN_FILE_CHARS = 200;

function listMarkdown(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st: import("node:fs").Stats;
    try {
      st = statSync(p);
    } catch {
      continue; // 断链/权限等脏条目，跳过
    }
    if (st.isDirectory()) listMarkdown(p, out);
    else if (name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

function readVaultSections(): { sections: NoteSection[]; fileCount: number } {
  const sections: NoteSection[] = [];
  const files = listMarkdown(VAULT);
  for (const p of files) {
    const md = readFileSync(p, "utf8");
    const rel = p.slice(VAULT.length + 1).replace(/\\/g, "/");
    sections.push(...chunkMarkdown(rel, md, statSync(p).mtimeMs));
  }
  return { sections, fileCount: files.length };
}

/** 从笔记中取一段有区分度的查询：优先 CJK 连续段（≥10 字）的中段子串，否则取一个较长的英文整词 */
function probeQuery(content: string): string | null {
  const cjkRuns = content.match(/[\u4e00-\u9fff\u3400-\u4dbf]{4,}/g) ?? [];
  const long = cjkRuns.filter(r => r.length >= 10);
  if (long.length > 0) {
    const run = long[Math.floor(long.length / 2)];
    const start = Math.max(0, Math.min(run.length - 10, Math.floor(run.length / 3)));
    return run.slice(start, start + Math.min(12, run.length - start));
  }
  const words = content.match(/[A-Za-z][A-Za-z_-]{5,}/g) ?? [];
  if (words.length > 0) return words[Math.floor(words.length / 2)];
  return null;
}

function main(): number {
  const { sections, fileCount } = readVaultSections();
  console.log(`vault: ${VAULT}`);
  console.log(`笔记 ${fileCount} 篇 → ${sections.length} 个片段`);

  const byFile = new Map<string, NoteSection[]>();
  for (const s of sections) {
    const arr = byFile.get(s.path) ?? [];
    arr.push(s);
    byFile.set(s.path, arr);
  }

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];
  for (const [path, secs] of byFile) {
    if (path.startsWith("inkpal-selfcheck")) continue;
    const query = probeQuery(secs.map(s => s.content).join("\n"));
    if (!query) continue;
    const hits = keywordSearch(sections, query, 3);
    const hitPaths = hits.map(h => h.section.path);
    if (hitPaths.includes(path)) {
      pass++;
    } else {
      fail++;
      failures.push(`${path} | 查询「${query}」 | 实际 top3: ${JSON.stringify(hitPaths)}`);
    }
  }

  console.log(`冒烟结果：${pass} 通过 / ${fail} 失败（每篇笔记一条特征子串查询，须进 top-3）`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  if (pass === 0) {
    console.log("没有任何可测笔记（vault 为空或都太短）——视为失败");
    return 1;
  }
  return fail === 0 ? 0 : 1;
}

process.exit(main());
