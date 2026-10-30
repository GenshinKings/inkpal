## 0.3.0 — 2026-10-31

- 侧边栏加直接对话：输入框里问她当前笔记或整库的问题，自动带当前笔记开头当上下文
- README 补侧边栏说明，更新已知缺口（批注只展示、不写回）

## 0.2.0 — 2026-10-31

- 新增 voyage 助教地址设置：填上就和 voyage 共用同一个助教（同一份学习者画像、长期记忆与教学法技能），插件只负责读笔记和显示结果；留空仍可用自带模型配置。
- 问答与写作辅助的模型调用统一走 adapter/voyage.ts 的调用器。

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-30

### Fixed

- 修复插件无法加载：入口类缺少 `export default`，Obsidian 找不到插件类（报「插件加载失败」）。

### Changed

- package.json 移除 `"type": "module"`（会干扰本地以 CJS 校验 main.js 导出形状）；冒烟脚本改名 `.mts` 保持 ESM 直跑。该字段不随发布产物分发，不影响 Obsidian 本身。

## [0.1.0] - 2026-10-29

### Added

- 笔记问答：全库关键词检索（中文 bigram + 字面加分，标题/路径加权），回答带 `[n]` 角标引用，点击跳转原笔记；检索不到时明确回答「笔记里没有找到」，不编造（幻觉闸门）。
- 写作辅助：摘要 / 润色 / 续写 / 翻译四个命令，产物一律以「AI 草稿」标注呈现，预览可编辑，确认后才写入，可撤销——补全而不代写。
- 多轮对话：追问自动做指代消解改写后再检索；对话历史仅存插件本地明文 JSON（data.json），不上传、不进 vault。
- 检索引擎与 Obsidian 解耦（`engine/` 纯 TypeScript，零第三方运行时依赖），`Retriever` 接口已预留，v1.1 可插入向量检索实现。
- 自检命令「inkpal：自检」：在真实 vault 内创建两篇固定 fixture 笔记，断言检索命中与问答冒烟，用于安装后验收。
- 发布流程：manifest.json semver + versions.json + CHANGELOG.md + `scripts/release.sh`（版本三处一致性校验 → 测试 → 构建 → git tag）。
