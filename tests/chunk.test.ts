import { describe, expect, it } from "vitest";
import { chunkMarkdown, extractTitle, stripFrontmatter } from "../engine/chunk.ts";

describe("stripFrontmatter", () => {
  it("剥掉 frontmatter，保留正文", () => {
    const md = "---\ntitle: x\ntags: [a]\n---\n\n# 正文\n内容";
    expect(stripFrontmatter(md)).toBe("# 正文\n内容");
  });
  it("无 frontmatter 原样返回", () => {
    expect(stripFrontmatter("# 直接开始")).toBe("# 直接开始");
  });
});

describe("extractTitle", () => {
  it("优先取一级标题", () => {
    expect(extractTitle("# 我的标题\n正文", "a/b.md")).toBe("我的标题");
  });
  it("无标题时取文件名", () => {
    expect(extractTitle("无标题正文", "folder/笔记名.md")).toBe("笔记名");
  });
});

describe("chunkMarkdown", () => {
  const md = [
    "# 番茄工作法",
    "一种时间管理方法。",
    "",
    "## 基本节奏",
    "每次专注 25 分钟，然后休息 5 分钟。",
    "",
    "### 打断处理",
    "内部打断先记下来再继续。",
    "",
    "## 常见误区",
    "不要把休息用来刷手机。",
  ].join("\n");

  it("按标题切分并保留面包屑", () => {
    const sections = chunkMarkdown("方法/番茄.md", md, 100);
    const headings = sections.map(s => s.heading);
    expect(headings.some(h => h.includes("# 番茄工作法 > ## 基本节奏"))).toBe(true);
    expect(headings.some(h => h.includes("### 打断处理"))).toBe(true);
    expect(sections.every(s => s.path === "方法/番茄.md")).toBe(true);
    expect(sections.every(s => s.title === "番茄工作法")).toBe(true);
  });

  it("正文内容不丢失", () => {
    const sections = chunkMarkdown("a.md", md, 100);
    const all = sections.map(s => s.content).join("\n");
    expect(all).toContain("25 分钟");
    expect(all).toContain("不要把休息用来刷手机");
  });

  it("无标题笔记的开头内容也有片段", () => {
    const sections = chunkMarkdown("b.md", "开头直接是一段话。\n\n第二段。", 100);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections[0].content).toContain("开头直接是一段话");
  });

  it("超长内容按段落再切并标注序号", () => {
    const long = "# 长文\n\n" + Array.from({ length: 40 }, (_, i) => `第${i}段。` + "内容".repeat(60)).join("\n\n");
    const sections = chunkMarkdown("c.md", long, 100);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0].heading).toContain("1/");
  });

  it("代码块内的 # 不当标题", () => {
    const md2 = "# 标题\n```bash\n# 这是注释\n```\n正文";
    const sections = chunkMarkdown("d.md", md2, 100);
    const all = sections.map(s => s.content).join("\n");
    expect(all).toContain("# 这是注释");
  });
});
