import { Component, MarkdownRenderer, Modal, Notice } from "obsidian";
import type { Hit } from "../engine/types.ts";
import { chatComplete } from "../engine/llm.ts";
import { runQa, type QaTurn } from "../engine/qa.ts";
import type { InkPalPlugin } from "./main.ts";

/** 把渲染结果里的 [n] 角标变成可点击引用，点击跳转原笔记 */
function linkifyCitations(el: HTMLElement, hits: Hit[], onOpen: (path: string) => void): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const targets: { node: Text; ranges: { n: number; start: number; end: number }[] }[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    if (!text || text.indexOf("[") === -1) continue;
    const ranges: { n: number; start: number; end: number }[] = [];
    const re = /\[(\d{1,2})\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= hits.length) ranges.push({ n, start: m.index, end: m.index + m[0].length });
    }
    if (ranges.length > 0) targets.push({ node, ranges });
  }
  for (const { node, ranges } of targets) {
    const text = node.textContent ?? "";
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const r of ranges) {
      if (r.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, r.start)));
      const hit = hits[r.n - 1];
      const a = document.createElement("a");
      a.className = "inkpal-cite";
      a.setText(`[${r.n}]`);
      a.setAttribute("aria-label", `${hit.section.path}${hit.section.heading ? " · " + hit.section.heading : ""}`);
      a.addEventListener("click", () => onOpen(hit.section.path));
      frag.appendChild(a);
      pos = r.end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.replaceWith(frag);
  }
}

export class ChatModal extends Modal {
  private readonly comp = new Component();
  private historyEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private busy = false;
  private streamEl: HTMLElement | null = null;
  private controller: AbortController | null = null;

  constructor(private readonly plugin: InkPalPlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    this.comp.load();
    this.modalEl.addClass("inkpal-chat");
    this.titleEl.setText("笔伴 · 问你的笔记");
    this.contentEl.empty();
    this.contentEl.addClass("inkpal-chat-content");

    const clearRow = this.contentEl.createDiv("inkpal-clear-row");
    const clearBtn = clearRow.createEl("button", { text: "清空对话" });
    clearBtn.addEventListener("click", async () => {
      this.plugin.chat = [];
      await this.plugin.saveChat();
      this.renderHistory();
    });

    this.historyEl = this.contentEl.createDiv("inkpal-history");
    this.renderHistory();

    const row = this.contentEl.createDiv("inkpal-input-row");
    this.inputEl = row.createEl("textarea");
    this.inputEl.placeholder = "问一句笔记里的事…（Enter 发送，Shift+Enter 换行）";
    this.sendBtn = row.createEl("button", { text: "发送" });
    this.sendBtn.addEventListener("click", () => void this.send());
    this.inputEl.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        void this.send();
      }
    });
    window.setTimeout(() => this.inputEl.focus(), 50);
  }

  onClose(): void {
    this.controller?.abort();
    this.comp.unload();
  }

  private renderHistory(): void {
    this.historyEl.empty();
    if (this.plugin.chat.length === 0) {
      const tip = this.historyEl.createDiv("inkpal-tip");
      tip.setText("回答基于你 vault 里的笔记并带 [n] 引用，点击角标可跳原文；笔记里没有的，它会明说没有。");
      return;
    }
    for (const turn of this.plugin.chat) {
      if (turn.role === "user") this.addUserBubble(turn.content);
      else void this.addAssistantBubble(turn.content, []);
    }
    this.scrollBottom();
  }

  private addUserBubble(text: string): void {
    const el = this.historyEl.createDiv("inkpal-msg inkpal-msg-user");
    el.createDiv("inkpal-msg-label").setText("你");
    el.createDiv("inkpal-msg-body").setText(text);
  }

  private async addAssistantBubble(text: string, hits: Hit[]): Promise<void> {
    const el = this.historyEl.createDiv("inkpal-msg inkpal-msg-assistant");
    el.createDiv("inkpal-msg-label").setText("笔伴");
    const body = el.createDiv("inkpal-msg-body");
    await MarkdownRenderer.render(
      this.plugin.app,
      text,
      body,
      this.plugin.app.workspace.getActiveFile()?.path ?? "",
      this.comp,
    );
    if (hits.length > 0) {
      linkifyCitations(body, hits, path => void this.plugin.app.workspace.openLinkText(path, ""));
    }
  }

  private scrollBottom(): void {
    this.historyEl.scrollTop = this.historyEl.scrollHeight;
  }

  private onStreamToken(token: string): void {
    if (!this.streamEl) {
      const el = this.historyEl.createDiv("inkpal-msg inkpal-msg-assistant");
      el.createDiv("inkpal-msg-label").setText("笔伴");
      this.streamEl = el.createDiv("inkpal-msg-body inkpal-streaming");
      el.scrollIntoView();
    }
    this.streamEl.setText((this.streamEl.textContent ?? "") + token);
    this.scrollBottom();
  }

  private async send(): Promise<void> {
    const question = this.inputEl.value.trim();
    if (!question || this.busy) return;
    this.busy = true;
    this.sendBtn.disabled = true;
    this.inputEl.disabled = true;
    this.streamEl = null;
    this.controller = new AbortController();
    const historyBefore = this.plugin.chat.slice();

    this.addUserBubble(question);
    this.inputEl.value = "";
    this.scrollBottom();
    this.plugin.setStatus("thinking");

    try {
      const wrapper: typeof chatComplete = (cfg, msgs, opts) => {
        const isQaCall = msgs[0]?.role === "system" && msgs[0].content.includes("问答助手");
        return chatComplete(cfg, msgs, isQaCall ? { ...opts, onToken: t => this.onStreamToken(t) } : opts);
      };
      const result = await runQa(
        this.plugin.retriever(),
        this.plugin.cfg(),
        historyBefore,
        question,
        this.plugin.settings.topK,
        wrapper,
      );

      // 移除流式占位，换成带引用的正式渲染
      this.historyEl.querySelector(".inkpal-streaming")?.parentElement?.remove();
      this.streamEl = null;
      await this.addAssistantBubble(result.answer, result.hits);

      const updated: QaTurn[] = [
        ...historyBefore,
        { role: "user", content: question },
        { role: "assistant", content: result.answer },
      ];
      this.plugin.chat = updated.slice(-40);
      await this.plugin.saveChat();
      this.scrollBottom();
    } catch (e) {
      this.historyEl.querySelector(".inkpal-streaming")?.parentElement?.remove();
      this.streamEl = null;
      const errEl = this.historyEl.createDiv("inkpal-msg inkpal-msg-error");
      errEl.setText(`出错了：${e instanceof Error ? e.message : String(e)}`);
      this.scrollBottom();
      if (!(e instanceof Error && e.message.includes("abort"))) new Notice("InkPal 请求失败，详见聊天窗错误信息");
    } finally {
      this.plugin.setStatus("idle");
      this.busy = false;
      this.sendBtn.disabled = false;
      this.inputEl.disabled = false;
      this.inputEl.focus();
    }
  }
}

export function openChat(plugin: InkPalPlugin): void {
  new ChatModal(plugin).open();
}
