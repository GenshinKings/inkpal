# InkPal 笔伴

> 住在你 Obsidian 里的笔友：**问你的笔记**（带引用跳转），**写作辅助**（补全而不代写）。

- **问答**：全库关键词检索（中文 bigram + IDF 加权 + 标题加权），回答带 `[n]` 角标，点击跳原笔记；笔记里没有的，它明说没有，不编造。
- **写作辅助**：摘要 / 润色 / 续写 / 翻译四个命令，产物以「AI 草稿」呈现——预览、可编辑、确认后才写入、Ctrl+Z 可撤销。**它补全，从不代写。**
- **多轮追问**：自动做指代消解改写（"它怎么配的？" → 补全实体再检索）；对话历史只存本插件明文 `data.json`，不上传、不进 vault。
- **引擎与界面分离**：`engine/` 是零依赖纯 TypeScript（可脱离 Obsidian 复用），`adapter/` 只是薄壳；`Retriever` 接口已留好，v1.1 可插向量检索。
- **隐私**：无加密、无遥测——设置与历史都是本机明文 JSON，你自己随时可查可删。

## 安装（手动三步）

1. 复制 `main.js`、`manifest.json`、`styles.css` 到 `<vault>/.obsidian/plugins/inkpal/`（目录不存在就新建）。
2. 重启 Obsidian → 设置 → 第三方插件 → 启用 **InkPal**。
3. 设置里填 **服务地址 / API Key / 模型**（默认智谱 `https://open.bigmodel.cn/api/paas/v4`），点「测试连接」。

然后运行命令 **InkPal：运行自检**：它会创建两篇临时笔记做检索命中 + 幻觉闸门 + 问答冒烟断言，跑完自动清理。自检全绿 = 安装验收通过。

## 使用

| 入口 | 说明 |
|---|---|
| 状态栏 `🖊 InkPal` / 侧栏图标 / 命令「打开问答」 | 打开聊天窗，问你的笔记（Enter 发送，Shift+Enter 换行） |
| 命令「写作辅助：摘要/润色/续写/翻译」 | 有选区处理选区，无选区处理整篇；草稿窗确认后写入 |
| 命令「运行自检」 | 随时验收检索与问答链路 |
| 设置页「测试连接」 | 验证服务商配置 |

支持任何 OpenAI 兼容服务（智谱 / DeepSeek / Kimi / OpenAI 等），改服务地址 + Key + 模型即可。

## 开发

```bash
npm install
npm test          # 41+ 单测，含检索评测关卡 12 例（9 gold + 3 幻觉闸门）
npm run smoke:vault  # 真实 vault 冒烟：每篇笔记取特征子串查询，须进 top-3
npm run dev       # esbuild watch
npm run build     # tsc 检查 + 生产构建 main.js
```

## 发布流程（semver）

```bash
# 改代码 → 更新 CHANGELOG.md → 统一提升三处版本 → 打 tag
npm version patch   # 或 minor / major（自动改 package.json + manifest.json）
# 手动把新版本加进 versions.json（"x.y.z": "最低 Obsidian 版本"）和 CHANGELOG.md
npm run release     # 校验版本一致 → 测试 → 构建 → git commit + tag vX.Y.Z
```

## 架构

```
engine/                  纯 TS，禁 import 'obsidian'，零第三方运行时依赖
├─ types.ts              共享类型（Retriever 接口在此，v1.1 向量实现直接插入）
├─ chunk.ts              markdown 标题感知分块（面包屑 + 长段再切）
├─ retrieve.ts           关键词检索：CJK bigram 单元 + 泛词黑名单 + IDF + 字面加分 + 覆盖度幻觉闸门
├─ llm.ts                OpenAI 兼容客户端（SSE 手解、重试、超时）
├─ context.ts            提示词拼装（引用规则 / 指代消解改写）
├─ assist.ts             写作辅助四命令的提示词与执行
└─ qa.ts                 问答管线（检索零命中 → 直接答「没有找到」，不调 LLM）
adapter/                 Obsidian 薄壳
├─ main.ts               插件入口（命令 / 状态栏 / 侧栏图标）
├─ notes.ts              vault 分片缓存（变更事件只打脏标记，惰性重建）
├─ chat-modal.ts         聊天窗（流式渲染 + 角标点击跳转 openLinkText）
├─ assist-modal.ts       AI 草稿预览 / 编辑 / 确认写入
├─ selfcheck.ts          自检验收命令
└─ settings.ts           设置页
```

## 路线图

- **v1.1**：`VectorRetriever`（OpenAI 兼容 embeddings + 本地 JSON 索引 + 余弦检索），`Retriever` 接口不变。
- **v1.2**：闪卡待筛草稿（AI ≤5 张/篇 → 人工筛改 → 导出 Anki）。
- **v2**：标签与双链建议（>100 篇触发）；混合检索（bigram-BM25 + RRF）。

## 许可

MIT。学习参考了 [Coopanion](https://github.com/Pal-AI-Lab/Coopanion)（AGPL-3.0）的架构设计思想（记忆即 markdown、人设即提示词、环境隔离），未使用其任何代码。
