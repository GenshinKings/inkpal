import type { InkPalPlugin } from "./main.ts";
import { Notice, PluginSettingTab, Setting } from "obsidian";
import { chatComplete } from "../engine/llm.ts";
import { runSelfCheck } from "./selfcheck.ts";

export interface InkPalSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topK: number;
}

export const DEFAULT_SETTINGS: InkPalSettings = {
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: "",
  model: "glm-4.6",
  temperature: 0.7,
  topK: 6,
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
      .setName("服务地址（OpenAI 兼容）")
      .setDesc("例如智谱：https://open.bigmodel.cn/api/paas/v4 ；DeepSeek：https://api.deepseek.com/v1")
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
      .setName("模型")
      .setDesc("服务商的模型 ID，如 glm-4.6 / deepseek-chat / moonshot-v1-32k")
      .addText(t =>
        t.setValue(this.plugin.settings.model).onChange(async v => {
          this.plugin.settings.model = v.trim();
          await this.plugin.saveSettings();
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
      .setDesc("向服务商发送一条最小请求，验证地址 / Key / 模型是否可用")
      .addButton(b =>
        b.setButtonText("测试").onClick(async () => {
          b.setDisabled(true);
          new Notice("InkPal：测试中…");
          try {
            const out = await chatComplete(this.plugin.cfg(), [
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
