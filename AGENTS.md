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
bun run changeset          # Create a release changeset
bun run version            # Apply changesets and update CHANGELOG
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

This architecture replaces the previous Claude Agent SDK-based runtime. Do not look for SDK orchestration code in the main process; the agent core now lives in `src/ai/` and `src/agent/`.

### IPC Pattern

Two-direction communication between main and renderer:

- **Request/Response** (renderer → main): `ipcRenderer.invoke` / `ipcMain.handle` with `prefix.method` naming (e.g., `agent.sendMessage`, `session.list`, `settings.get`)
- **Push Events** (main → renderer): `webContents.send` / `ipcRenderer.on` with `push:eventName` naming (e.g., `push:messagesUpdated`, `push:agentState`). Typed by `PushEventMap` in `src/shared/ipc-types.ts`.

The preload script exposes `window.ipc` (request/response) and `window.push` (event subscription). **Proxy objects do NOT work** with `contextBridge.exposeInMainWorld` — each IPC method must be an explicit function object.

### Service Wiring

Manual constructor-based DI in `src/main/index.ts`. Services instantiated in order: `SessionStore` → `Persistence` → `ConfigStore` → `SkillsStore` → `ToolRegistry` → `PushService` → `EventAdapter` → `AgentService`. `bridgeSessionStoreToPush()` subscribes store events before windows are created. All shared services are injected into `registerIpcHandlers()` via `IpcDependencies`.

### Data Flow

```
User input → chatStore.sendMessage() → window.ipc.agent.sendMessage
→ AgentService.sendMessage() → resolve provider/model → load skills + workspace files
→ buildSystemPrompt() → Agent.prompt() → agentLoop()
→ AgentEvent → EventAdapter → SessionStore (messages)
→ bridgeSessionStoreToPush() → PushService → webContents.send
→ AgentService / EventAdapter → PushService (run state + tool execution)
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
- **Runtime break**: The old Claude Agent SDK runtime is gone; new work should target the provider-agnostic agent core and main-process integration described above.
- **Settings migration**: Old format (`providers[]`, `agent.provider`, `agent.model`) → new format (`agent.providerConfigs[]`, `agent.activeProviderId`, `agent.activeModelId`). Migration in `parseSettings()` is best-effort; deprecated fields like `thinkingBudget` and `customSystemPrompt` are removed.
- **App data**: `~/.amon/` — `settings.json`, `sessions/` (JSONL persistence), `skills/`, `workspace/`
- **Skills**: Built-in skills live in repo `skills/` and are indexed by `skills/index.json`. Default built-ins are installed to `~/.amon/skills` on first launch. Load order is system/project extra dirs (default `.claude`), then `~/.amon/skills`, then `<workspace>/.amon/skills`, with later entries overriding earlier ones.
- **Tools**: 8 built-in tools registered in `createDefaultToolRegistry()` at `src/main/tools/tool-registry.ts` (bash, read, write, edit, glob, grep, web-fetch, web-search)
