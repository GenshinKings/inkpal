# InkPal · 笔伴

给 Obsidian 加一个**住在你笔记里的助教**：问你的笔记要答案（带引用），写作时给草稿但**不代写**。

和 [voyage](https://github.com/GenshinKings/voyage) 共用同一个助教——同一份学习者画像、长期记忆和教学法。
两个软件一起用，说的是同一套话，记得同一件事。

## 它能做什么

| 功能 | 怎么用 | 说明 |
|---|---|---|
| 问你的笔记 | `Ctrl+P` → `笔伴 · 问你的笔记` | 检索 vault 里的片段回答，`[1]` `[2]` 是可点的引用，点了跳到原文 |
| 写作辅助 | 选中文字 → 命令面板 → `写作辅助：摘要 / 润色 / 续写 / 翻译` | 先给草稿，**你点确认才写进笔记** |
| 自检 | 设置 → `运行自检` | 在 vault 里建临时笔记验证检索与问答，结束后自动清理 |

设计上有一条硬规则：**它补全，但不替你写。** 所有写回都要你点确认。

## 安装

1. 装 [Obsidian](https://obsidian.md)（1.5.0+）
2. 把 `main.js`、`manifest.json`、`styles.css` 放进
   `<你的库>/.obsidian/plugins/inkpal/`
3. Obsidian 设置 → 第三方插件 → 启用 **InkPal**
4. 配置模型（见下）

## 配置模型

两种方式，选一种：

### A. 共用 voyage 的助教（推荐）

前提：本机跑着 voyage（默认 `http://127.0.0.1:7412`）。

- 设置 → `voyage 助教地址` 填 `http://127.0.0.1:7412`

好处：和 voyage 是同一个助教——同一份学习者画像、记忆、教学法，学习进度也连在一起。

### B. 直连任意 OpenAI 兼容服务

- 设置 → `服务商` 下拉选一家（DeepSeek / 智谱 / 通义 / 硅基流动 / OpenAI / OpenRouter…），地址自动填好
- 填 API Key
- 点 `从服务商拉模型列表`，在下拉里选模型（不用再猜模型名）

> 服务商清单由 `scripts/fetch-providers.mjs` 从公开数据抓取生成，`npm run providers` 可刷新。

## 常见问题

**模型报 400 `The supported API model names are ...`**
模型名不对。点「从服务商拉模型列表」选一个，别手打。

**设置里的框是空的**
配置存在 `data.json`。如果 JSON 里带了 BOM，Obsidian 解析失败会退回默认值——用编辑器存成无 BOM 的 UTF-8。

**API Key 存在哪**
明文存在 `<库>/.obsidian/plugins/inkpal/data.json`，不会上传。**别把这个文件分享给别人。**

## 开发

```bash
npm install
npm run dev        # 监听构建
npm run build      # tsc 检查 + 生产构建
npm test           # vitest（41 个测试）
npm run providers  # 刷新服务商清单
```

目录：

```
adapter/    Obsidian 侧（设置、弹窗、voyage 桥接、模型列表）
engine/     纯逻辑（切块、检索、问答、写作辅助），不依赖 Obsidian，可单测
scripts/    抓服务商清单、vault 冒烟
tests/      vitest
```

## 已知缺口

- **笔记批注还没接到界面**：voyage 侧 `/api/inkpal/annotate` 已能返回行级批注
  （`line / quote / kind / myUnderstanding / correct`，其中 `myUnderstanding` 是
  「你当时是这么理解的」），插件侧还没有按钮触发和渲染。
- 检索是关键词匹配（`KeywordRetriever`），不是向量检索；笔记量大时会漏召回。
- 不支持流式增量渲染 voyage 的回复（voyage 桥接是一次性返回）。

## License

MIT
