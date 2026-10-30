import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { InkPalPlugin } from "./main.ts";
import { makeCaller } from "./voyage.ts";
import { requestUrl } from "obsidian";

/**
 * 侧边栏助教面板。
 *
 * 三个动作：查当前笔记、查整库、给笔记打分。
 * 原则：只读不写——不给「自动改笔记」，避免误伤；要改也先出清单让人点。
 */
export const VIEW_TYPE_INKPAL_SIDE = "inkpal-side";

interface NoteMeta {
  path: string;
  title: string;
  excerpt: string;
}

export class InkPalSideView extends ItemView {
  private logEl!: HTMLElement;
  private busy = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: InkPalPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_INKPAL_SIDE;
  }

  getDisplayText(): string {
    return "笔伴助教";
  }

  getIcon(): string {
    return "graduation-cap";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("inkpal-side");

    const head = root.createDiv({ cls: "inkpal-side-head" });
    head.createEl("div", { text: "笔伴助教", cls: "inkpal-side-title" });
    head.createEl("div", {
      text: this.plugin.settings.voyageUrl ? "与 voyage 共用助教" : "使用自带模型配置",
      cls: "inkpal-side-sub",
    });

    const bar = root.createDiv({ cls: "inkpal-side-bar" });
    this.btn(bar, "查当前笔记", () => this.reviewCurrent());
    this.btn(bar, "查整库", () => this.reviewVault());
    this.btn(bar, "打分", () => this.scoreCurrent());

    this.logEl = root.createDiv({ cls: "inkpal-side-log" });
    this.say("选好一篇笔记，点上面的按钮。我只读不改——要改的话我会先给清单。");
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private btn(parent: HTMLElement, label: string, fn: () => Promise<void>): void {
    const b = parent.createEl("button", { text: label, cls: "inkpal-side-btn" });
    b.onclick = async () => {
      if (this.busy) return;
      this.busy = true;
      b.setAttr("disabled", "true");
      try {
        await fn();
      } catch (e) {
        this.say("出错：" + (e instanceof Error ? e.message : String(e)), true);
      } finally {
        this.busy = false;
        b.removeAttribute("disabled");
      }
    };
  }

  private say(text: string, isErr = false): void {
    const d = this.logEl.createDiv({ cls: "inkpal-side-item" + (isErr ? " err" : "") });
    d.setText(text);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private activeFile() {
    const f = this.app.workspace.getActiveFile();
    if (!f) {
      this.say("先打开一篇笔记", true);
      return null;
    }
    return f;
  }

  /** 查当前笔记：走 voyage 的批注接口，逐条列「当你是这么理解的 → 正确的是」。 */
  private async reviewCurrent(): Promise<void> {
    const f = this.activeFile();
    if (!f) return;
    const content = await this.app.vault.read(f);
    const res = await this.post("/api/inkpal/annotate", { path: f.path, content });
    const items = (res.items ?? []) as { line: number; quote: string; kind: string; myUnderstanding: string; correct: string }[];
    if (items.length === 0) {
      this.say("这篇没挑出问题。");
      return;
    }
    this.say(`「${f.basename}」挑了 ${items.length} 处：`);
    for (const it of items) {
      this.say(`· 第 ${it.line} 行｜${it.quote}`);
      this.say(`  当时的理解：${it.myUnderstanding}`);
      this.say(`  正确：${it.correct}`);
    }
  }

  /** 查整库：把清单（路径+标题+摘要）交给 voyage 体检。 */
  private async reviewVault(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    if (files.length === 0) {
      this.say("库里没有笔记。", true);
      return;
    }
    const notes: NoteMeta[] = [];
    for (const f of files.slice(0, 120)) {
      const raw = await this.app.vault.cachedRead(f);
      notes.push({ path: f.path, title: f.basename, excerpt: raw.replace(/\s+/g, " ").slice(0, 200) });
    }
    this.say(`正在体检 ${notes.length} 篇…`);
    const res = await this.post("/api/inkpal/vault-review", { vault: this.app.vault.getName(), notes });
    if (res.summary) this.say("总评：" + res.summary);
    const issues = (res.issues ?? []) as { path: string; issue: string; suggestion: string }[];
    for (const it of issues.slice(0, 8)) {
      this.say(`· ${it.path}｜${it.issue}`);
      if (it.suggestion) this.say(`  建议：${it.suggestion}`);
    }
    const links = (res.links ?? []) as { from: string; to: string; why: string }[];
    for (const l of links.slice(0, 5)) {
      this.say(`🔗 ${l.from} ↔ ${l.to}（${l.why}）`);
    }
  }

  /** 打分：三项 0~5 + 建议。 */
  private async scoreCurrent(): Promise<void> {
    const f = this.activeFile();
    if (!f) return;
    const content = await this.app.vault.read(f);
    const res = await this.post("/api/inkpal/score", { path: f.path, content });
    const c = res.concept ?? 0;
    const st = res.structure ?? 0;
    const rv = res.reviewability ?? 0;
    this.say(`「${f.basename}」概念 ${c}/5 · 结构 ${st}/5 · 可复习 ${rv}/5`);
    if (res.summary) this.say("总评：" + res.summary);
    for (const a of (res.advice ?? []) as string[]) this.say("→ " + a);
  }

  /** 统一出口：配了 voyage 就打 voyage，否则直接报错让人去配。 */
  private async post<T extends Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    const url = (this.plugin.settings.voyageUrl || "").trim().replace(/\/+$/, "");
    if (!url) {
      throw new Error("先在设置里填 voyage 助教地址（默认 http://127.0.0.1:7412）");
    }
    const res = await requestUrl({
      url: url + path,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body),
      throw: false,
    });
    if (res.status >= 400) {
      const t = typeof res.text === "string" ? res.text : "";
      throw new Error("voyage 返回 " + res.status + (t ? "：" + t.slice(0, 160) : ""));
    }
    return res.json as T;
  }
}
