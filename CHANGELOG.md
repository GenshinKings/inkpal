# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- 笔记问答：全库关键词检索（中文 bigram + 字面加分，标题/路径加权），回答带 `[n]` 角标引用，点击跳转原笔记；检索不到时明确回答「笔记里没有找到」，不编造（幻觉闸门）。
- 写作辅助：摘要 / 润色 / 续写 / 翻译四个命令，产物一律以「AI 草稿」标注呈现，预览可编辑，确认后才写入，可撤销——补全而不代写。
- 多轮对话：追问自动做指代消解改写后再检索；对话历史仅存插件本地明文 JSON（data.json），不上传、不进 vault。
- 检索引擎与 Obsidian 解耦（`engine/` 纯 TypeScript，零第三方运行时依赖），`Retriever` 接口已预留，v1.1 可插入向量检索实现。
- 自检命令「inkpal：自检」：在真实 vault 内创建两篇固定 fixture 笔记，断言检索命中与问答冒烟，用于安装后验收。
- 发布流程：manifest.json semver + versions.json + CHANGELOG.md + `scripts/release.sh`（版本三处一致性校验 → 测试 → 构建 → git tag）。
