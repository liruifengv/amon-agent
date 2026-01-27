# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rule

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Always use Chinese when responding to me.

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
│   ├── streamState.ts          - Stream event state machine (block lifecycle)
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

`messageHandler.ts` dispatches SDK messages by type, with `streamState.ts` tracking block lifecycle:

```typescript
// Message types
switch (sdkMessage.type) {
  case 'assistant':    // Complete message with ContentBlocks
  case 'stream_event': // Stream events (see below)
  case 'result':       // Query complete with usage stats
  case 'user':         // Ignored (added by client)
  case 'system':       // Logging only
}

// Stream event lifecycle
message_start → content_block_start → content_block_delta → content_block_stop → message_delta → message_stop

// StreamState tracks blocks by index
streamState.openTextBlock(index, id)    // content_block_start
streamState.appendDelta(index, content) // content_block_delta
streamState.closeBlock(index)           // content_block_stop
```

Tool calls support hierarchy via `parentToolUseId` for Subagent scenarios (Task tool spawning child tools).

### Message Display (Renderer)

`components/Message/` uses component dispatch pattern:

```
MessageItem
├── UserMessage         - Simple text bubble
└── AssistantMessage    - Grouped content blocks
    ├── ContentBlockRenderer (switch dispatch)
    │   ├── TextBlock       - Markdown via Streamdown
    │   ├── ThinkingBlock   - Collapsible thinking
    │   └── ToolCallBlock   - Tool execution display (supports nested via isNested prop)
    ├── ToolGroup           - Collapsible tool container
    ├── SubagentToolGroup   - Hierarchical Subagent tools (default collapsed)
    └── TodoList            - Task progress display
```

Tool calls with `parentToolUseId` are grouped under their parent Task tool in `SubagentToolGroup`.

### Key Files

- `src/shared/types.ts` - Shared TypeScript interfaces (ContentBlock with id/isComplete, ToolCall with parentToolUseId)
- `src/shared/ipc.ts` - IPC channel constants (including push channels)
- `src/shared/schemas.ts` - Zod schemas for settings validation
- `src/main/store/sessionStore.ts` - Central state with EventEmitter
- `src/main/agent/messageHandler.ts` - SDK message type handlers
- `src/main/agent/streamState.ts` - Stream state machine for block lifecycle tracking

### Skills System

Skills extend Claude's capabilities with custom prompts. Located in:
- System: `~/.claude/skills/<skill-name>/SKILL.md`
- Workspace: `<workspace>/.claude/skills/<skill-name>/SKILL.md`
- Bundled: `resources/skills/` (dev) or `app.asar.unpacked/resources/skills` (packaged)

SKILL.md requires YAML frontmatter with `name` and `description` fields.

### Storage

- Sessions: `~/.amon/sessions/*.json`
- Settings: `~/.amon/settings.json`

## Detailed Architecture

### 整体架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Amon Desktop App                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Main Process (Node.js)                        │    │
│  │                                                                       │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │    │
│  │  │   Agent     │    │   Store     │    │      IPC Handlers       │  │    │
│  │  │  Service    │───▶│  (Session   │───▶│  (Request/Response +    │  │    │
│  │  │             │    │   Store)    │    │   Push Events)          │  │    │
│  │  └──────┬──────┘    └─────────────┘    └───────────┬─────────────┘  │    │
│  │         │                                          │                 │    │
│  │         ▼                                          │                 │    │
│  │  ┌─────────────┐                                   │                 │    │
│  │  │   Claude    │                                   │                 │    │
│  │  │  Agent SDK  │                                   │                 │    │
│  │  └─────────────┘                                   │                 │    │
│  └────────────────────────────────────────────────────┼─────────────────┘    │
│                                                       │                      │
│                              IPC Bridge (contextBridge)                      │
│                                                       │                      │
│  ┌────────────────────────────────────────────────────┼─────────────────┐    │
│  │                     Renderer Process (React)       │                 │    │
│  │                                                    ▼                 │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │    │
│  │  │    Zustand  │◀───│   IPC       │◀───│      Components         │  │    │
│  │  │    Stores   │    │  Listeners  │    │  (Chat, Message, etc.)  │  │    │
│  │  └─────────────┘    └─────────────┘    └─────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 进程间通信 (IPC) 详解

Electron 应用分为 Main Process 和 Renderer Process，通过 IPC 通信：

```
┌──────────────────┐                              ┌──────────────────┐
│  Renderer        │                              │  Main Process    │
│  (React UI)      │                              │  (Node.js)       │
├──────────────────┤                              ├──────────────────┤
│                  │   ──── Request/Response ──▶  │                  │
│  electronAPI.    │   agent:sendMessage          │  ipcMain.handle  │
│  agent.send()    │   session:create             │  ('channel',     │
│                  │   settings:get               │   handler)       │
│                  │                              │                  │
│                  │   ◀──── Push Events ────     │                  │
│  electronAPI.    │   messages:updated           │  mainWindow.     │
│  agent.on()      │   query:state                │  webContents.    │
│                  │   permission:request         │  send('channel') │
└──────────────────┘                              └──────────────────┘
```

**IPC 通道定义** (`src/shared/ipc.ts`):
- Request channels: `agent:*`, `session:*`, `settings:*`, `permission:*`
- Push channels: `messages:updated`, `query:state`, `query:complete`, `permission:request`

### 消息处理流程详解

用户发送消息到 AI 响应的完整流程：

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  User   │    │  Renderer   │    │    Main     │    │   Claude    │
│  Input  │    │  Process    │    │   Process   │    │  Agent SDK  │
└────┬────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
     │                │                   │                  │
     │  Type message  │                   │                  │
     ├───────────────▶│                   │                  │
     │                │  IPC: sendMessage │                  │
     │                ├──────────────────▶│                  │
     │                │                   │  query(prompt)   │
     │                │                   ├─────────────────▶│
     │                │                   │                  │
     │                │                   │  Stream Events   │
     │                │                   │◀─────────────────┤
     │                │                   │  message_start   │
     │                │                   │  content_block_* │
     │                │                   │  message_stop    │
     │                │                   │                  │
     │                │  Push: messages   │                  │
     │                │◀──────────────────┤  (per event)     │
     │                │  :updated         │                  │
     │  UI Update     │                   │                  │
     │◀───────────────┤                   │                  │
     │                │                   │                  │
```

### 流式事件状态机 (StreamState)

Claude Agent SDK 返回的流式事件需要通过状态机管理：

```
                    ┌─────────────────────────────────────────────┐
                    │              StreamState                     │
                    │  blocksByIndex: Map<number, BlockState>     │
                    └─────────────────────────────────────────────┘
                                         │
     ┌───────────────────────────────────┼───────────────────────────────────┐
     │                                   │                                   │
     ▼                                   ▼                                   ▼
┌─────────────┐                   ┌─────────────┐                   ┌─────────────┐
│ TextBlock   │                   │ThinkingBlock│                   │  ToolBlock  │
│ State       │                   │   State     │                   │   State     │
├─────────────┤                   ├─────────────┤                   ├─────────────┤
│ id          │                   │ id          │                   │ id          │
│ index       │                   │ index       │                   │ index       │
│ content     │                   │ thinking    │                   │ name        │
│ kind: text  │                   │ kind:       │                   │ inputBuffer │
└─────────────┘                   │  thinking   │                   │ kind: tool  │
                                  └─────────────┘                   └─────────────┘

Event Flow:
┌──────────────┐   ┌───────────────────┐   ┌───────────────────┐   ┌──────────────┐
│message_start │──▶│content_block_start│──▶│content_block_delta│──▶│content_block │
│              │   │  openXxxBlock()   │   │  appendDelta()    │   │    _stop     │
│ beginStep()  │   │                   │   │                   │   │ closeBlock() │
└──────────────┘   └───────────────────┘   └───────────────────┘   └──────────────┘
                                                                          │
                                                                          ▼
                                                                   ┌──────────────┐
                                                                   │ message_stop │
                                                                   │  resetStep() │
                                                                   └──────────────┘
```

### 工具调用与 Subagent 层级

当 AI 调用 Task 工具（Subagent）时，会产生嵌套的工具调用：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Tool Call Hierarchy                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Task Tool (parentToolUseId: null)                              │    │
│  │  id: "tool_123"                                                 │    │
│  │  name: "Task"                                                   │    │
│  │  input: { prompt: "Search for files...", subagent_type: "..." }│    │
│  │                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │  Child Tool 1 (parentToolUseId: "tool_123")             │    │    │
│  │  │  id: "tool_456"                                         │    │    │
│  │  │  name: "Glob"                                           │    │    │
│  │  │  input: { pattern: "**/*.ts" }                          │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │  Child Tool 2 (parentToolUseId: "tool_123")             │    │    │
│  │  │  id: "tool_789"                                         │    │    │
│  │  │  name: "Read"                                           │    │    │
│  │  │  input: { file_path: "/path/to/file.ts" }               │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

UI Rendering:
┌─────────────────────────────────────────────────────────────────────────┐
│ ▼ Task: Search for files...                              [Running]      │
│   ├── Glob: **/*.ts                                      [Completed]    │
│   └── Read: /path/to/file.ts                             [Completed]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 状态管理架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         State Management                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Main Process (Single Source of Truth)                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  SessionStore (EventEmitter)                                     │    │
│  │  ├── sessions: Map<sessionId, Session>                          │    │
│  │  ├── messages: Map<sessionId, Message[]>                        │    │
│  │  └── toolCalls: Map<sessionId, Map<toolId, ToolCall>>           │    │
│  │                                                                  │    │
│  │  Events: 'messages:updated', 'session:created', etc.            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              │ IPC Push                                  │
│                              ▼                                           │
│  Renderer Process (Cache)                                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Zustand Stores                                                  │    │
│  │  ├── chatStore: { messages, toolCalls, ... }                    │    │
│  │  ├── sessionStore: { sessions, currentSessionId, ... }          │    │
│  │  ├── settingsStore: { settings, ... }                           │    │
│  │  └── permissionStore: { pendingRequests, ... }                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 消息内容块类型

```typescript
// 消息包含多个内容块
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: MessageContentBlock[];
  toolCalls?: ToolCall[];
}

// 内容块类型
type MessageContentBlock =
  | TextContentBlock      // 文本内容 (Markdown)
  | ThinkingContentBlock  // 思考过程 (可折叠)
  | ToolUseContentBlock;  // 工具调用引用

// 工具调用
interface ToolCall {
  id: string;
  name: string;              // 工具名称: Read, Write, Edit, Bash, Task, etc.
  input: Record<string, unknown>;
  inputBuffer?: string;      // 流式输入缓冲
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  isError?: boolean;
  parentToolUseId?: string;  // 父工具 ID (Subagent 场景)
}
```

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
