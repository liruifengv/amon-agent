"amon-agent": minor
---

Refactor Amon into a provider-agnostic agent platform and ship a major workflow upgrade across runtime, skills, and UI.

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
