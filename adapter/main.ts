import { Plugin, type Editor, type WorkspaceLeaf } from "obsidian";
import { KeywordRetriever } from "../engine/retrieve.ts";
import type { LlmConfig } from "../engine/types.ts";
import type { QaTurn } from "../engine/qa.ts";
import { runAssistCommand } from "./assist-modal.ts";
import { openChat } from "./chat-modal.ts";
import { VaultSections } from "./notes.ts";
import { runSelfCheck } from "./selfcheck.ts";
import { DEFAULT_SETTINGS, InkPalSettingTab, type InkPalSettings } from "./settings.ts";
import { InkPalSideView, VIEW_TYPE_INKPAL_SIDE } from "./side-view.ts";

interface InkPalData {
  settings?: Partial<InkPalSettings>;
  chat?: QaTurn[];
}

export class InkPalPlugin extends Plugin {
  settings: InkPalSettings = { ...DEFAULT_SETTINGS };
  chat: QaTurn[] = [];
  sections!: VaultSections;
  private statusItem!: HTMLElement;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as InkPalData | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
    this.chat = Array.isArray(data?.chat) ? data.chat : [];
    this.sections = new VaultSections(this.app.vault, ref => this.registerEvent(ref));

    this.statusItem = this.addStatusBarItem();
    this.setStatus("idle");
    this.statusItem.addClass("mod-clickable");
    this.statusItem.addEventListener("click", () => openChat(this));

    this.addRibbonIcon("message-circle", "笔伴 · 问你的笔记", () => openChat(this));

    this.addCommand({ id: "open-chat", name: "打开问答", callback: () => openChat(this) });
    this.addCommand({ id: "self-check", name: "运行自检", callback: () => void runSelfCheck(this) });

    const assist = (id: string, name: string, kind: Parameters<typeof runAssistCommand>[1]): void => {
      this.addCommand({
        id,
        name,
        editorCallback: (editor: Editor) => void runAssistCommand(this, kind, editor),
      });
    };
    assist("assist-summarize", "写作辅助：摘要", "summarize");
    assist("assist-polish", "写作辅助：润色", "polish");
    assist("assist-continue", "写作辅助：续写", "continue");
    assist("assist-translate", "写作辅助：翻译", "translate");

    this.registerView(VIEW_TYPE_INKPAL_SIDE, leaf => new InkPalSideView(leaf, this));
    this.addRibbonIcon("graduation-cap", "笔伴 · 助教侧栏", () => this.activateSide());
    this.addCommand({ id: "open-side", name: "打开助教侧栏", callback: () => this.activateSide() });
    this.addSettingTab(new InkPalSettingTab(this));
  }

  cfg(): LlmConfig {
    return {
      baseUrl: this.settings.baseUrl,
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      temperature: this.settings.temperature,
    };
  }

  retriever(): KeywordRetriever {
    return new KeywordRetriever(() => this.sections.get(false), { minCoverage: 0.4 });
  }

  setStatus(state: "idle" | "thinking"): void {
    this.statusItem.setText(state === "idle" ? "🖊 InkPal" : "🖊 InkPal · 思考中…");
  }

  async persist(): Promise<void> {
    await this.saveData({ settings: this.settings, chat: this.chat });
  }

  /** 打开（或聚焦）侧边栏助教面板 */
  async activateSide(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_INKPAL_SIDE)[0];
    if (!leaf) {
      const created: WorkspaceLeaf | null = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
      if (!created) return;
      leaf = created;
      await leaf.setViewState({ type: VIEW_TYPE_INKPAL_SIDE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async saveSettings(): Promise<void> {
    await this.persist();
  }

  async saveChat(): Promise<void> {
    await this.persist();
  }
}

export default InkPalPlugin;