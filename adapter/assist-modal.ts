import { Component, Modal, Notice, type Editor } from "obsidian";
import { ASSIST_LABELS, runAssist, type AssistKind } from "../engine/assist.ts";
import type { InkPalPlugin } from "./main.ts";

const MAX_TEXT_CHARS = 20000;

/** AI 草稿预览窗：可编辑，确认后才写入（补全而不代写）；插入后 Ctrl+Z 可撤销 */
class AssistDraftModal extends Modal {
  private readonly comp = new Component();

  constructor(
    private readonly plugin: InkPalPlugin,
    private readonly kind: AssistKind,
    private readonly draft: string,
    private readonly editor: Editor,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.comp.load();
    this.modalEl.addClass("inkpal-draft");
    this.titleEl.setText(`AI 草稿 · ${ASSIST_LABELS[this.kind]}（可编辑，确认后才写入）`);
    this.contentEl.empty();

    const ta = this.contentEl.createEl("textarea", { cls: "inkpal-draft-text" });
    ta.value = this.draft;

    const row = this.contentEl.createDiv("inkpal-draft-row");
    const hint = row.createDiv("inkpal-draft-hint");
    hint.setText("插入后用 Ctrl+Z 撤销。");
    const cancel = row.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const insert = row.createEl("button", { text: "写入笔记", cls: "mod-cta" });
    insert.addEventListener("click", () => {
      const text = ta.value.trim();
      if (text.length === 0) {
        new Notice("草稿为空，已取消");
        this.close();
        return;
      }
      this.editor.replaceSelection(text + "\n");
      this.close();
    });
    window.setTimeout(() => ta.focus(), 50);
  }

  onClose(): void {
    this.comp.unload();
  }
}

export async function runAssistCommand(plugin: InkPalPlugin, kind: AssistKind, editor: Editor): Promise<void> {
  const selection = editor.getSelection();
  const text = selection.length > 0 ? selection : editor.getValue();
  if (text.trim().length === 0) {
    new Notice("没有可处理的内容：选中一段文字，或确保当前笔记非空");
    return;
  }
  if (text.length > MAX_TEXT_CHARS) {
    new Notice(`文本过长（${text.length} > ${MAX_TEXT_CHARS} 字符），请先选中要处理的一段`);
    return;
  }
  plugin.setStatus("thinking");
  try {
    const draft = await runAssist(plugin.cfg(), kind, text);
    new AssistDraftModal(plugin, kind, draft, editor).open();
  } catch (e) {
    new Notice(`InkPal：${ASSIST_LABELS[kind]}失败 —— ${e instanceof Error ? e.message : String(e)}`, 10000);
  } finally {
    plugin.setStatus("idle");
  }
}
