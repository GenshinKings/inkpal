import type { InkPalPlugin } from "./main.ts";
import { Notice, PluginSettingTab, Setting } from "obsidian";
import { chatComplete } from "../engine/llm.ts";
import { makeCaller } from "./voyage.ts";
import { fetchModels } from "./models.ts";
import { PROVIDERS } from "./providers.generated.ts";
import { runSelfCheck } from "./selfcheck.ts";

export interface InkPalSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topK: number;
  voyageUrl: string;
}

export const DEFAULT_SETTINGS: InkPalSettings = {
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: "",
  model: "glm-4.6",
  temperature: 0.7,
  topK: 6,
  voyageUrl: '',
};

export class InkPalSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: InkPalPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("InkPal 笔伴").setHeading();

    new Setting(containerEl)
      .setName("voyage 助教地址（可选）")
      .setDesc("填了就和 voyage 共用同一个助教（同一份记忆与教学法）；留空则只用下面的模型配置。例：http://127.0.0.1:7412")
      .addText(t =>
        t.setValue(this.plugin.settings.voyageUrl).onChange(async v => {
          this.plugin.settings.voyageUrl = v.trim().replace(/\/+$/, "");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("服务地址（OpenAI 兼容）")

      .addText(t =>
        t.setValue(this.plugin.settings.baseUrl).onChange(async v => {
          this.plugin.settings.baseUrl = v.trim().replace(/\/+$/, "");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("明文保存在本插件 data.json 中，不会上传；请勿把 vault 里的 data.json 分享给别人")
      .addText(t => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.apiKey).onChange(async v => {
          this.plugin.settings.apiKey = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("服务商（内置清单，脚本可更新）")
      .setDesc("选一个自动填上面的地址；清单由 scripts/fetch-providers.mjs 抓取")
      .addDropdown(d => {
        d.addOption("", "— 选择服务商 —");
        for (const p of PROVIDERS) {
          d.addOption(p.id, p.name + (p.models > 0 ? ` · ${p.models} 个模型` : ""));
        }
        d.setValue("");
        d.onChange(async v => {
          const hit = PROVIDERS.find(x => x.id === v);
          if (!hit) return;
          this.plugin.settings.baseUrl = hit.baseUrl;
          await this.plugin.saveSettings();
          new Notice("InkPal：地址已填 " + hit.baseUrl);
          this.display();
        });
      });
    new Setting(containerEl)
      .setName("模型")
      .setDesc("服务商的模型 ID，如 glm-4.6 / deepseek-chat / moonshot-v1-32k")
      .addText(t =>
        t.setValue(this.plugin.settings.model).onChange(async v => {
          this.plugin.settings.model = v.trim();
          await this.plugin.saveSettings();
        }),
      );

    let modelPicker: HTMLSelectElement | null = null;
    new Setting(containerEl)
      .setName("从服务商拉模型列表")
      .setDesc("读 GET /models，选一个填进上面的模型框；不用再猜模型名")
      .addButton(b =>
        b.setButtonText("拉取").onClick(async () => {
          b.setDisabled(true);
          try {
            const ids = await fetchModels(this.plugin.settings.baseUrl, this.plugin.settings.apiKey);
            if (modelPicker) { modelPicker.remove(); modelPicker = null; }
            const holder = document.createElement("div");
            holder.style.marginTop = "8px";
            const sel = document.createElement("select");
            sel.style.width = "100%";
            for (const id of ids) {
              const opt = document.createElement("option");
              opt.value = id; opt.textContent = id;
              if (id === this.plugin.settings.model) opt.selected = true;
              sel.appendChild(opt);
            }
            sel.onchange = async () => {
              this.plugin.settings.model = sel.value;
              await this.plugin.saveSettings();
              new Notice("InkPal：模型已切换为 " + sel.value);
              this.display();
            };
            holder.appendChild(sel);
            b.buttonEl.parentElement?.parentElement?.after(holder);
            modelPicker = sel;
            new Notice("InkPal：拉到 " + ids.length + " 个模型");
          } catch (e) {
            new Notice("InkPal：拉取失败 —— " + (e instanceof Error ? e.message : String(e)), 8000);
          } finally {
            b.setDisabled(false);
          }
        }),
      );

    new Setting(containerEl)
      .setName("温度")
      .setDesc("0 = 稳定，1 = 更有发挥")
      .addSlider(s =>
        s
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async v => {
            this.plugin.settings.temperature = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("检索片段数 top-K")
      .setDesc("每次问答带进上下文的笔记片段数量")
      .addSlider(s =>
        s
          .setLimits(3, 12, 1)
          .setValue(this.plugin.settings.topK)
          .setDynamicTooltip()
          .onChange(async v => {
            this.plugin.settings.topK = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("测试连接")
      .setDesc("填了 voyage 地址就测 voyage 助教，否则测上面的模型配置")
      .addButton(b =>
        b.setButtonText("测试").onClick(async () => {
          b.setDisabled(true);
          new Notice("InkPal：测试中…");
          try {
            const caller = makeCaller(this.plugin.settings.voyageUrl);
            const out = await caller(this.plugin.cfg(), [
              { role: "user", content: "回复 OK 两个字母即可" },
            ], { temperature: 0, maxTokens: 8, timeoutMs: 20000 });
            new Notice(`InkPal：连接成功（模型回复：${out.slice(0, 40)}）`);
          } catch (e) {
            new Notice(`InkPal：连接失败 —— ${e instanceof Error ? e.message : String(e)}`, 10000);
          } finally {
            b.setDisabled(false);
          }
        }),
      );

    new Setting(containerEl)
      .setName("运行自检")
      .setDesc("在 vault 里创建两篇临时笔记，验证检索命中、幻觉闸门与问答冒烟，结束后自动清理")
      .addButton(b =>
        b.setButtonText("自检").onClick(async () => {
          b.setDisabled(true);
          try {
            await runSelfCheck(this.plugin);
          } finally {
            b.setDisabled(false);
          }
        }),
      );
  }
}
