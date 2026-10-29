import { Modal, Notice, TFile, TFolder, type App } from "obsidian";
import { keywordSearch } from "../engine/retrieve.ts";
import { runQa } from "../engine/qa.ts";
import type { InkPalPlugin } from "./main.ts";

const DIR = "inkpal-selfcheck";
const NOTE_A = `${DIR}/自检A·番茄.md`;
const NOTE_B = `${DIR}/自检B·占位.md`;
const CONTENT_A = "# 自检 A：番茄计时\n\n笔伴自检专用笔记。番茄工作法自检卡规定：每次专注 25 分钟，随后休息 5 分钟，用物理计时器记录。\n";
const CONTENT_B = "# 自检 B：占位\n\n这篇笔记与番茄无关，只谈天气与散步。\n";

interface CheckLine {
  name: string;
  pass: boolean;
  detail: string;
  skipped?: boolean;
}

async function upsert(plugin: InkPalPlugin, path: string, content: string): Promise<void> {
  const existing = plugin.app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) await plugin.app.vault.modify(existing, content);
  else await plugin.app.vault.create(path, content);
}

async function cleanup(plugin: InkPalPlugin): Promise<void> {
  for (const path of [NOTE_A, NOTE_B]) {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f) await plugin.app.vault.trash(f, true).catch(() => {});
  }
  const dir = plugin.app.vault.getAbstractFileByPath(DIR);
  if (dir instanceof TFolder) await plugin.app.vault.trash(dir, true).catch(() => {});
}

class SelfCheckReportModal extends Modal {
  constructor(
    private readonly lines: CheckLine[],
    app: App,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("InkPal 自检报告");
    this.contentEl.empty();
    for (const l of this.lines) {
      const row = this.contentEl.createDiv("inkpal-check-row");
      row.createSpan({ text: l.skipped ? "⏭" : l.pass ? "✅" : "❌" });
      const body = row.createDiv();
      body.createDiv("inkpal-check-name").setText(l.name + (l.skipped ? "（跳过）" : ""));
      body.createDiv("inkpal-check-detail").setText(l.detail);
    }
  }
}

/** 验收命令：真实 vault 内建两篇 fixture 笔记 → 检索命中断言 + 幻觉闸门 + 问答冒烟 → 自动清理 */
export async function runSelfCheck(plugin: InkPalPlugin): Promise<void> {
  const lines: CheckLine[] = [];
  try {
    try {
      await plugin.app.vault.createFolder(DIR);
    } catch {
      // 已存在
    }
    await upsert(plugin, NOTE_A, CONTENT_A);
    await upsert(plugin, NOTE_B, CONTENT_B);

    const sections = await plugin.sections.get(true);
    const hasFixtures = sections.some(s => s.path === NOTE_A) && sections.some(s => s.path === NOTE_B);
    lines.push({
      name: "fixture 笔记已入检索库",
      pass: hasFixtures,
      detail: hasFixtures ? `vault 共 ${sections.length} 个片段` : "两篇 fixture 均未出现在分片结果中",
    });

    const hits = keywordSearch(sections, "番茄工作法自检卡规定每次专注多久", 3);
    const hitPaths = hits.map(h => h.section.path);
    lines.push({
      name: "检索命中目标笔记",
      pass: hitPaths.includes(NOTE_A),
      detail: `top3：${hitPaths.length > 0 ? hitPaths.join("、") : "（无命中）"}`,
    });

    const gate = keywordSearch(sections, "量子纠缠隐形传态", 5);
    lines.push({
      name: "幻觉闸门（无关查询必须零命中）",
      pass: gate.length === 0,
      detail: gate.length === 0 ? "无关查询零命中 ✓" : `意外命中：${gate.map(h => h.section.path).join("、")}`,
    });

    if (plugin.settings.apiKey.length === 0) {
      lines.push({ name: "问答冒烟", pass: true, detail: "未配置 API Key，跳过（配置后可再跑）", skipped: true });
    } else {
      try {
        const result = await runQa(plugin.retriever(), plugin.cfg(), [], "自检卡规定每次专注多少分钟？", 6);
        const answerOk = result.answer.length > 0 && !result.answer.includes("没有找到");
        const citeOk = result.hits.some(h => h.section.path === NOTE_A);
        lines.push({
          name: "问答冒烟",
          pass: answerOk && citeOk,
          detail: `回答：${result.answer.slice(0, 100)}${citeOk ? "（引用含 fixture）" : "（引用未含 fixture）"}`,
        });
      } catch (e) {
        lines.push({ name: "问答冒烟", pass: false, detail: `请求失败：${e instanceof Error ? e.message : String(e)}` });
      }
    }
  } catch (e) {
    lines.push({ name: "自检流程", pass: false, detail: e instanceof Error ? e.message : String(e) });
  } finally {
    await cleanup(plugin);
    plugin.sections.invalidate();
  }

  const failed = lines.filter(l => !l.pass && !l.skipped).length;
  new SelfCheckReportModal(lines, plugin.app).open();
  new Notice(failed === 0 ? "InkPal 自检：全部通过 ✅" : `InkPal 自检：${failed} 项失败 ❌`, 8000);
}
