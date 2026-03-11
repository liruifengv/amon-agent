# amon-agent

## 0.3.0

### Minor Changes

- [#13](https://github.com/liruifengv/amon-agent/pull/13) [`efbb9ac`](https://github.com/liruifengv/amon-agent/commit/efbb9ac0ef064125ee0f3dcbd71ee6b89f3a1455) Thanks [@liruifengv](https://github.com/liruifengv)! - Refactor Amon into a provider-agnostic agent platform and ship a major workflow upgrade across runtime, skills, and UI.

  **BREAKING CHANGES**

  - Removed the Claude Agent SDK and replaced it with Amon's own agent core and provider-agnostic runtime.
  - The settings and provider configuration schema changed substantially. Existing configs are not fully compatible with the new architecture: legacy fields are migrated on a best-effort basis, but deprecated fields and older provider-specific options are no longer supported and may require manual reconfiguration.

  - Introduce a new three-layer architecture with a standalone AI streaming layer, a framework-agnostic agent core, and Electron-specific integration for session state, IPC, and push events.
  - Add built-in support for Anthropic, OpenAI Completions, OpenAI Responses, and Google Gemini providers, with richer thinking-level controls, extra provider parameters, and web search support.
  - Expand the local agent workflow with bundled tools for bash, file read/write/edit, glob, grep, web fetch, and web search, plus project bootstrap context from `AGENTS.md`, `SOUL.md`, and `BOOTSTRAP.md`.
  - Overhaul the skills system with built-in skill packaging, skill management UI, recommended skills, and improved loading from bundled, user, and workspace sources.
  - Refresh the chat and settings experience with grouped assistant turns, context usage indicators, improved permission and confirmation flows, better provider configuration, and safer input handling for IME users.
  - Add broader automated test coverage and update the documentation to match the new architecture and product capabilities.

  将 Amon 重构为一个与 Provider 无关的 Agent 平台，并在运行时、Skills 和 UI 层面带来一轮重要的工作流升级。

  **重大变更**

  - 移除了 Claude Agent SDK，改为使用 Amon 自己实现的 Agent 核心和与 Provider 无关的运行时。
  - 设置和 Provider 配置结构发生了较大变化。现有配置与新架构并非完全兼容：旧字段会尽力迁移，但已废弃的字段以及旧的 provider 特定配置项已不再支持，部分场景可能需要手动重新配置。

  - 引入新的三层架构，包括独立的 AI 流式处理层、与框架无关的 Agent 核心，以及负责会话状态、IPC 和推送事件的 Electron 集成层。
  - 新增对 Anthropic、OpenAI Completions、OpenAI Responses 和 Google Gemini 的内置支持，并提供更丰富的 thinking level 控制、额外 provider 参数能力，以及 web search 支持。
  - 扩展本地 Agent 工作流，内置 bash、文件读写编辑、glob、grep、web fetch 和 web search 等工具，同时支持从 `AGENTS.md`、`SOUL.md` 和 `BOOTSTRAP.md` 加载项目启动上下文。
  - 重构 Skills 系统，提供内置 skill 打包能力、skill 管理界面、推荐 skills，并改进从内置、用户目录和工作区来源加载 skills 的机制。
  - 升级聊天和设置体验，包括分组展示 assistant turns、上下文使用量指示器、更完善的权限与确认流程、更好的 provider 配置体验，以及针对输入法用户更安全的输入处理。
  - 补充更全面的自动化测试覆盖，并同步更新文档，使其与新的架构和产品能力保持一致。

## 0.2.3

### Patch Changes

- [`e97da9f`](https://github.com/liruifengv/amon-agent/commit/e97da9f0f19a2477ed8756844d53e16dc8f00e4b) Thanks [@liruifengv](https://github.com/liruifengv)! - Fix external image rendering in markdown and enable proper file download

  - Updated CSP `img-src` to allow `https:` and `http:` sources so external markdown images render correctly
  - Updated CSP `connect-src` to allow external fetch requests for image downloads
  - Added CORS bypass via `session.webRequest.onHeadersReceived` to prevent cross-origin fetch failures
  - Added `will-download` handler to show a save dialog instead of silently downloading or opening a new window

- [`e98f3ed`](https://github.com/liruifengv/amon-agent/commit/e98f3ed3c16a3577f01f9dbb6be1dfd8c96b1153) Thanks [@liruifengv](https://github.com/liruifengv)! - Open external links in system default browser instead of Electron window

  - Added `setWindowOpenHandler` to intercept `window.open()` and redirect http/https links to the system browser via `shell.openExternal`
  - Disabled Streamdown's built-in link safety modal (`linkSafety: { enabled: false }`) since links are now handled by the OS

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
