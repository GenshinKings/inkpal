import { debounce, TFile, type EventRef, type Vault } from "obsidian";
import { chunkMarkdown } from "../engine/chunk.ts";
import type { NoteSection } from "../engine/types.ts";

/** vault 全量分片缓存：变更事件只打脏标记（只读，无写入回路），下次读取时惰性重建 */
export class VaultSections {
  private sections: NoteSection[] | null = null;
  private dirty = true;
  private readonly markDirty: () => void;

  constructor(
    private readonly vault: Vault,
    registerEvent: (ref: EventRef) => unknown,
  ) {
    this.markDirty = debounce(() => {
      this.dirty = true;
    }, 1500, true);
    registerEvent(vault.on("modify", () => this.markDirty()));
    registerEvent(vault.on("create", () => this.markDirty()));
    registerEvent(vault.on("delete", () => this.markDirty()));
    registerEvent(vault.on("rename", () => this.markDirty()));
  }

  async get(force = false): Promise<NoteSection[]> {
    if (!force && !this.dirty && this.sections) return this.sections;
    const out: NoteSection[] = [];
    for (const f of this.vault.getMarkdownFiles()) {
      try {
        const md = await this.vault.cachedRead(f);
        out.push(...chunkMarkdown(f.path, md, f.stat.mtime));
      } catch {
        // 读取失败的文件跳过，不阻塞整体检索
      }
    }
    this.sections = out;
    this.dirty = false;
    return out;
  }

  invalidate(): void {
    this.dirty = true;
  }
}
