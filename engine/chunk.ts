// engine/chunk.ts — markdown 标题感知分块。纯函数，无 IO、无 Obsidian 依赖。
import type { NoteSection } from "./types.ts";

/** 超过此字符数的片段按段落再切（中文 1 字 ≈ 1 token 量级，1200 字 ≈ 600-1200 token） */
export const MAX_SECTION_CHARS = 1200;
/** 小于此字符数的片段并入前一片段，避免碎片 */
export const MIN_SECTION_CHARS = 150;

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

interface RawSection {
  heading: string;
  content: string;
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\n+/, "");
}

export function extractTitle(body: string, path: string): string {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (m) return m[1];
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function splitByHeadings(body: string): RawSection[] {
  const result: RawSection[] = [];
  const stack: { level: number; text: string }[] = [];
  let current: RawSection = { heading: "", content: "" };
  let inFence = false;

  const breadcrumb = (): string =>
    stack.map(s => "#".repeat(s.level) + " " + s.text).join(" > ");

  for (const line of body.split("\n")) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    const m = inFence ? null : line.match(HEADING_RE);
    if (m) {
      if (current.content.trim().length > 0) result.push(current);
      const level = m[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: m[2] });
      current = { heading: breadcrumb(), content: "" };
    } else {
      current.content += line + "\n";
    }
  }
  if (current.content.trim().length > 0) result.push(current);
  return result;
}

/** 按空行段落聚合切分；单段超长时按句子硬切 */
function splitLong(content: string, max: number): string[] {
  if (content.length <= max) return [content];
  const paragraphs = content.split(/\n\s*\n/);
  const parts: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim().length > 0) parts.push(buf.trim());
    buf = "";
  };
  for (const p of paragraphs) {
    if (p.length > max) {
      flush();
      for (const piece of hardSplit(p, max)) parts.push(piece);
      continue;
    }
    if (buf.length + p.length + 2 > max) flush();
    buf += (buf.length > 0 ? "\n\n" : "") + p;
  }
  flush();
  return parts;
}

function hardSplit(text: string, max: number): string[] {
  const parts: string[] = [];
  let buf = "";
  const sentences = text.split(/(?<=[。！？.!?])\s*/);
  for (const s of sentences) {
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
      continue;
    }
    if (buf.length + s.length > max) {
      parts.push(buf);
      buf = "";
    }
    buf += s;
  }
  if (buf.length > 0) parts.push(buf);
  return parts;
}

export function chunkMarkdown(path: string, markdown: string, mtime: number): NoteSection[] {
  const body = stripFrontmatter(markdown);
  const title = extractTitle(body, path);
  const raw = splitByHeadings(body);

  // 无标题的小片段并入前一片段；带标题的保留独立片段（标题面包屑是检索的重要信号）
  const merged: RawSection[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      r.heading === "" &&
      r.content.length < MIN_SECTION_CHARS &&
      prev.content.length + r.content.length <= MAX_SECTION_CHARS
    ) {
      prev.content += "\n\n" + r.content;
      continue;
    }
    merged.push({ ...r });
  }

  const sections: NoteSection[] = [];
  for (const r of merged) {
    const parts = splitLong(r.content.trim(), MAX_SECTION_CHARS);
    parts.forEach((content, i) => {
      sections.push({
        path,
        title,
        heading: parts.length > 1 ? `${r.heading || "（开头）"}（${i + 1}/${parts.length}）` : r.heading,
        content,
        mtime,
      });
    });
  }
  return sections;
}
