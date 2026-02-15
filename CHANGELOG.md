# amon-agent

## 0.2.2

### Patch Changes

- [#11](https://github.com/liruifengv/amon-agent/pull/11) [`c2fa99d`](https://github.com/liruifengv/amon-agent/commit/c2fa99d7c464340dd1dcaebf798e48a8f3bda875) Thanks [@liruifengv](https://github.com/liruifengv)! - feat: add i18n internationalization support for Chinese and English

  - Add `i18next` + `react-i18next` for renderer process and main process
  - Create translation files for 9 namespaces (common, chat, message, settings, sidebar, permission, onboarding, menu, validation)
  - Add language selector in General Settings (English / 中文), default to English
  - Replace all hardcoded UI strings (~200) across ~30 component files with `t()` calls
  - Internationalize Electron menus and native dialogs
  - Real-time language switching without app restart, synced across all windows

## 0.2.1

### Patch Changes

- [`c240587`](https://github.com/liruifengv/amon-agent/commit/c24058787cb0c5dd3a0625d2dac27ce8810468ae) Thanks [@liruifengv](https://github.com/liruifengv)! - 更新供应商模型配置：

  - **GLM**: 新增 `glm-5` 模型
  - **MiniMax**: 新增 `MiniMax-M2.5` 模型
  - **Kimi**: 新增 Kimi 供应商，API 地址 `https://api.kimi.com/coding`，模型 `kimi-for-coding`
  - **Claude 官方/自定义/OpenRouter**: 新增 `claude-opus-4-6` / `anthropic/claude-opus-4.6` 模型

## 0.2.0

### Minor Changes

- [`2829cd3`](https://github.com/liruifengv/amon-agent/commit/2829cd3ab7f155403df4d7cbbad0cffb4723af10) Thanks [@liruifengv](https://github.com/liruifengv)! - Support mention file use @

- [`eb5b5ae`](https://github.com/liruifengv/amon-agent/commit/eb5b5ae596938341fee99e0982b3004f1decbdf3) Thanks [@liruifengv](https://github.com/liruifengv)! - Enhanced Plan Mode

### Patch Changes

- [`352b7d4`](https://github.com/liruifengv/amon-agent/commit/352b7d400f2e7b259db9d1b0e99001a02052e1d7) Thanks [@liruifengv](https://github.com/liruifengv)! - Improve Write/Edit tool UI

- [#8](https://github.com/liruifengv/amon-agent/pull/8) [`212146f`](https://github.com/liruifengv/amon-agent/commit/212146f00dc674b3f223cf1667bef0c5b3cc08e2) Thanks [@liruifengv](https://github.com/liruifengv)! - Fix textaream layout issue

- [#7](https://github.com/liruifengv/amon-agent/pull/7) [`1ae6af2`](https://github.com/liruifengv/amon-agent/commit/1ae6af2325dd9bb0c0de0616d425710f3bf42de4) Thanks [@liruifengv](https://github.com/liruifengv)! - Refactor stream message system

## 0.1.2

### Patch Changes

- [`1930e72`](https://github.com/liruifengv/amon-agent/commit/1930e7285b1313b327cf168a3aaaf21be5067dca) Thanks [@liruifengv](https://github.com/liruifengv)! - Add some preset provider

- [`457fc81`](https://github.com/liruifengv/amon-agent/commit/457fc8156496dc15c256ea2ee5cef06fbbc886ee) Thanks [@liruifengv](https://github.com/liruifengv)! - Add tip for unsaved settings change

## 0.1.1

### Patch Changes

- [`623a58a`](https://github.com/liruifengv/amon-agent/commit/623a58ad0e7fd4d2bfbb137bbe69132c17e9a97d) Thanks [@liruifengv](https://github.com/liruifengv)! - Add onboarding component for first use

- [`168eeba`](https://github.com/liruifengv/amon-agent/commit/168eeba481f0b6f674b0b1b13c2a5cc3fc4bb167) Thanks [@liruifengv](https://github.com/liruifengv)! - feat: enhance streaming message UI with unified loading indicator

## 0.1.0

### Minor Changes

- [`834d756`](https://github.com/liruifengv/amon-agent/commit/834d756fd4a44488d015966508a82cdc0f16895f) Thanks [@liruifengv](https://github.com/liruifengv)! - Support upload image(click select/paste/drag)

### Patch Changes

- [`8e5b38d`](https://github.com/liruifengv/amon-agent/commit/8e5b38ded90bfe96b53ee4df9a1d7d5318b0345d) Thanks [@liruifengv](https://github.com/liruifengv)! - Input Auto focus

- [`5689a1a`](https://github.com/liruifengv/amon-agent/commit/5689a1ae0646649414751ae7658a3941f385b26c) Thanks [@liruifengv](https://github.com/liruifengv)! - Fix ScrollToBottom component display

- [`cf9822a`](https://github.com/liruifengv/amon-agent/commit/cf9822a89b18a1924a054c2f5d37e1f51b4d1f60) Thanks [@liruifengv](https://github.com/liruifengv)! - Reasoning message markdown rendering

- [`976329f`](https://github.com/liruifengv/amon-agent/commit/976329f49d6a16953d8c3d2d574f1f93e3b142f8) Thanks [@liruifengv](https://github.com/liruifengv)! - Fix message block style

- [`1a1fb28`](https://github.com/liruifengv/amon-agent/commit/1a1fb28c9da43d5504ef80cce76ed7ceafd9e6b6) Thanks [@liruifengv](https://github.com/liruifengv)! - fix auto scroll issue

## 0.0.1

### Patch Changes

- [`eeffd9f`](https://github.com/liruifengv/amon-agent/commit/eeffd9fa909c0aa5797c8ac8776e3e2b3bc86a52) Thanks [@liruifengv](https://github.com/liruifengv)! - ## Amon - Your AI coworker running locally on the your desktop

  Amon 是运行在本地的智能 AI Coworker，基于 [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) 构建。它不仅能与你对话，还能真正帮你完成工作：编写代码、执行命令、搜索信息、管理文件。

  ### ✨ 核心特性

  - **🤖 真正的工作伙伴** — 能执行任务、操作文件、运行代码的智能助手，而非简单的对话机器人
  - **🔒 本地优先** — 数据存储在本地，保护隐私和安全
  - **🧩 可扩展** — 通过 Skills 系统扩展功能，适应不同工作场景
  - **🎨 可视化界面** — 为 Claude Code 提供友好的图形界面体验
