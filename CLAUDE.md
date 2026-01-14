# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Amon (amon-agent) is a desktop chat application built with Electron + React + TypeScript that integrates with Anthropic's Claude AI through the Claude Agent SDK.

## Commands

```bash
bun start        # Development server with hot reload
bun run lint     # Run ESLint on TypeScript files
bun run package  # Package for distribution
bun run make     # Create platform installers (macOS ZIP, Linux DEB/RPM, Windows)
```

## Architecture

### Process Architecture

```
Main Process (src/main/)
├── index.ts                    - Window management, shortcuts
├── ipc/handlers.ts             - IPC request handlers
├── agent/
│   ├── agentService.ts         - Claude SDK query execution
│   ├── messageHandler.ts       - SDK message type dispatching
│   ├── permissionManager.ts    - Tool permission requests (60s timeout)
│   └── titleService.ts         - Auto-generate session titles
└── store/
    ├── sessionStore.ts         - In-memory state (single source of truth)
    ├── persistence.ts          - File I/O layer (atomic writes)
    ├── configStore.ts          - Settings persistence (uses Zod validation)
    └── skillsStore.ts          - Skills loading from system/workspace dirs
         │
         │ IPC Channels (src/shared/ipc.ts)
         │ Push events: messages:updated, query:state, etc.
         │
    Preload Script (src/preload/index.ts)
    └── Exposes window.electronAPI
         │
         ▼
Renderer Process (src/renderer/)
├── store/
│   ├── chatStore.ts            - Message cache (subscribes to main process)
│   ├── sessionStore.ts         - Session list state
│   ├── settingsStore.ts        - Settings state
│   └── permissionStore.ts      - Permission request state
└── components/
    ├── Message/                - Message display components
    ├── Chat/                   - Chat view, input, message list
    ├── Sidebar/                - Session list, navigation
    ├── Permission/             - Permission request dialogs
    └── Settings/               - Settings window
```

### Data Flow

Main process is the single source of truth. Renderer subscribes to push events:

```
User Input → IPC Request → AgentService → SessionStore → Push Event → Renderer Cache → UI
```

SessionStore emits events that IPC handlers forward to renderer:
- `messages:updated` - Message content changes
- `query:state` - Loading state changes
- `query:complete` - Query finished
- `session:created/deleted/updated` - Session changes

### Message Handling (Main Process)

`messageHandler.ts` dispatches SDK messages by type:

```typescript
switch (sdkMessage.type) {
  case 'assistant':    // Complete message with ContentBlocks
  case 'stream_event': // Incremental deltas (text_delta, thinking_delta)
  case 'result':       // Query complete with usage stats
  case 'user':         // Ignored (added by client)
  case 'system':       // Logging only
}
```

### Message Display (Renderer)

`components/Message/` uses component dispatch pattern:

```
MessageItem
├── UserMessage         - Simple text bubble
└── AssistantMessage    - Grouped content blocks
    ├── ContentBlockRenderer (switch dispatch)
    │   ├── TextBlock       - Markdown via Streamdown
    │   ├── ThinkingBlock   - Collapsible thinking
    │   └── ToolCallBlock   - Tool execution display
    ├── ToolGroup           - Collapsible tool container
    └── TodoList            - Task progress display
```

### Key Files

- `src/shared/types.ts` - Shared TypeScript interfaces
- `src/shared/ipc.ts` - IPC channel constants (including push channels)
- `src/shared/schemas.ts` - Zod schemas for settings validation
- `src/main/store/sessionStore.ts` - Central state with EventEmitter
- `src/main/agent/messageHandler.ts` - SDK message type handlers

### Skills System

Skills extend Claude's capabilities with custom prompts. Located in:
- System: `~/.claude/skills/<skill-name>/SKILL.md`
- Workspace: `<workspace>/.claude/skills/<skill-name>/SKILL.md`
- Bundled: `resources/skills/` (dev) or `app.asar.unpacked/resources/skills` (packaged)

SKILL.md requires YAML frontmatter with `name` and `description` fields.

### Storage

- Sessions: `~/.amon/sessions/*.json`
- Settings: `~/.amon/settings.json`

## Environment Variables

- `ANTHROPIC_API_KEY` (required) - Anthropic API credentials
- `ANTHROPIC_BASE_URL` (optional) - Custom API endpoint
- `CLAUDE_MODEL` (optional) - Default model override

## Build Notes

- Electron Forge with Vite plugin
- SDK must be unpacked from asar (`forge.config.ts` handles via `asar.unpack`)
- Skills resources copied via `extraResource` in forge config
- Two renderer windows: main_window, settings_window

## TODO

- [ ] CLI 命令注册：实现 "Install shell command" 功能，让用户可以在终端使用 `amon` 命令
  - macOS: symlink 到 `/usr/local/bin` 或提供 shell 脚本添加到 PATH
  - Windows: NSIS 安装器添加 PATH 或应用内 `setx` 命令
  - Linux: symlink 到 `/usr/local/bin`
