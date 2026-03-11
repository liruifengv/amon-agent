# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
bun install                # Install dependencies
bun start                  # Dev server with hot reload (electron-forge start)
bun run lint               # ESLint
bun run typecheck          # tsc --noEmit
bun run test               # vitest run (tests in tests/**/*.test.ts)
bun run test:watch         # vitest watch mode
bun run package            # Build app package
bun run make               # Build platform installers
bun run download:binaries  # Download bundled runtime binaries (bun, uv) before packaging
```

## Architecture

Amon is an Electron desktop app (AI coding assistant) with four build targets, each with its own Vite config:

| Target | Entry | Vite Config | Purpose |
|--------|-------|-------------|---------|
| Main | `src/main/index.ts` | `vite.main.config.ts` | Electron main process |
| Preload | `src/preload/index.ts` | `vite.preload.config.ts` | contextBridge IPC bridge |
| Renderer | `src/renderer/index.tsx` | `vite.renderer.config.ts` | Main window (React) |
| Settings | `src/renderer/settings.tsx` | `vite.settings.config.ts` | Settings window (React) |

### Three-Layer Agent Architecture

**`src/ai/`** — Provider-agnostic AI streaming layer. Global provider registry (`api-registry.ts`) with four built-in providers: `anthropic-messages`, `openai-completions`, `openai-responses`, `google-generative-ai`. Entry points: `streamSimple()`, `completeSimple()`, `stream()`, `complete()`.

**`src/agent/`** — Framework-agnostic Agent class and loop. `Agent` manages state, tools, messages, and streaming. `agentLoop()` implements the dual-loop pattern: inner loop (LLM call → tool execution → check steering), outer loop (check follow-up queue → repeat). Tools use Zod schemas for input validation.

**`src/main/agent/`** — Electron-specific integration. `AgentService` creates Agent instances per session, wires dependencies. `EventAdapter` bridges `AgentEvent` → `SessionStore` mutations → `PushService` calls.

### IPC Pattern

Two-direction communication between main and renderer:

- **Request/Response** (renderer → main): `ipcRenderer.invoke` / `ipcMain.handle` with `prefix.method` naming (e.g., `agent.sendMessage`, `session.list`, `settings.get`)
- **Push Events** (main → renderer): `webContents.send` / `ipcRenderer.on` with `push:eventName` naming (e.g., `push:messagesUpdated`, `push:agentState`). Typed by `PushEventMap` in `src/shared/ipc-types.ts`.

The preload script exposes `window.ipc` (request/response) and `window.push` (event subscription). **Proxy objects do NOT work** with `contextBridge.exposeInMainWorld` — each IPC method must be an explicit function object.

### Service Wiring

Manual constructor-based DI in `src/main/index.ts`. Services instantiated in order: `SessionStore` → `Persistence` → `ConfigStore` → `SkillsStore` → `ToolRegistry` → `PushService` → `EventAdapter` → `AgentService`. All injected into `registerIpcHandlers()` via `IpcDependencies` interface.

### Data Flow

```
User input → chatStore.sendMessage() → window.ipc.agent.sendMessage
→ AgentService.sendMessage() → Agent.prompt() → agentLoop()
→ streamSimple() → tool execution → AgentEvent
→ EventAdapter → SessionStore (EventEmitter)
→ bridgeSessionStoreToPush() → PushService → webContents.send
→ Renderer push listener → chatStore → React re-render
```

### Renderer State

Zustand stores in `src/renderer/store/`: `chatStore` (messages, agent state, push listeners), `sessionStore` (session CRUD via IPC), `settingsStore` (settings, theme, language).

## Key Conventions

- **Path aliases**: `@/*` → `src/*`, `@shared/*` → `src/shared/*` (configured in tsconfig AND all 4 vite configs)
- **Shared code**: `src/shared/` for types, schemas, constants used by both main and renderer
- **Validation**: Zod v4 for schemas (`src/shared/schemas.ts` for settings, `src/agent/types.ts` for tool input)
- **i18n**: `i18next` with namespace JSON files in `src/locales/{en,zh}/`
- **UI**: React 19 + Radix UI primitives + Tailwind CSS v4 + Shadcn components in `src/renderer/components/ui/`
- **Settings migration**: Old format (`providers[]`, `agent.provider`) → new format (`agent.providerConfigs[]`, `agent.activeProviderId`). Migration in `parseSettings()` via `migrateSettings()` in `src/shared/schemas.ts`
- **App data**: `~/.amon/` — `settings.json`, `sessions/` (JSONL persistence), `workspace/`
- **Skills**: Loaded from multiple directories (built-in `skills/`, user-installed). YAML frontmatter metadata, formatted into system prompt via `formatSkillsForPrompt()`
- **Tools**: 8 built-in tools registered in `createDefaultToolRegistry()` at `src/main/tools/tool-registry.ts` (bash, read, write, edit, glob, grep, web-fetch, web-search)
