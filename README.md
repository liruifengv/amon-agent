
<div align="center">
  <img src="./public/images/Logo.png" style="border-radius: 16px;" alt="Amon" width="64" />
  <h1>Amon Coworker</h1>
  <p>Your AI coworker running on your desktop</p>

  <a href="./README.zh-CN.md">中文</a> | English

  <br/>
  <br/>

  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white" alt="Electron"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://zod.dev/"><img src="https://img.shields.io/badge/Zod-4-3E67B1?logo=zod&logoColor=white" alt="Zod"></a>
</div>

## About Amon

Amon is an intelligent AI coworker that runs locally on your desktop. It doesn't just chat with you — it actually helps you get work done: writing code, executing commands, searching for information, and managing files.

Amon features a custom three-layer agent architecture with a provider-agnostic AI streaming layer, supporting multiple LLM providers including Anthropic Claude, OpenAI, Google Gemini, and API-compatible providers out of the box.

Starting with `0.3.0`, Amon no longer depends on Claude Agent SDK. The runtime is implemented in-repo with a provider-agnostic AI layer, a framework-agnostic agent core, and Electron-specific integration.

## Breaking Changes in 0.3.0

- Claude Agent SDK has been removed and replaced by Amon's own agent core and runtime.
- Settings and provider configuration moved to the new `agent.providerConfigs[]` / `agent.activeProviderId` / `agent.activeModelId` schema.
- Existing settings are migrated on a best-effort basis. Older provider-specific fields and deprecated options may need to be reconfigured manually after upgrading.

## Feature Overview

Let's take a look at Amon's features through screenshots.

![Thinking / Tool Calls](./screenshots/img1.png)

Amon can think through your messages, execute tool calls, and complete your tasks.

![Dark Theme](./screenshots/img3.jpg)

Amon supports both dark and light theme modes.

![File Diff](./screenshots/img4.jpg)

Amon can display file modification diffs.

![Send Images](./screenshots/img5.png)

Amon supports sending image messages.

![Custom Multi-Provider](./screenshots/img6.png)

Amon allows you to add multiple API providers with built-in support for Anthropic Claude, OpenAI, Google Gemini, and API-compatible providers (GLM, MiniMax, Kimi, etc.).

![Workspaces](./screenshots/img8.png)

Amon works on a per-workspace (folder) basis. You can set up multiple workspaces. Default workspace: `~/.amon/workspace`

Amon supports Agent Skills — you can install Skills to add specialized capabilities to Amon.

## Getting Started

### Installation

Visit the [Releases](https://github.com/liruifengv/amon-agent/releases) page to download the installer for your platform.

#### Note for macOS Users

Since the app is not Apple-signed, macOS may block it from running. After downloading, run the following command in the terminal to remove the quarantine attribute:

```bash
xattr -cr /Applications/Amon.app
```

### Configuration

After first launch, follow these steps to configure:

1. **Configure AI Provider**

   Go to `Settings` → `Provider`, create and enable the AI provider you want to use

2. **Create a Workspace**

   Go to `Settings` → `Workspace`, create a new workspace and select a local folder as the project root

   Default workspace: `~/.amon/workspace`

3. **Start Using**

   Return to the main screen, click `New Session`, select a workspace and start chatting

## Development Guide

### Prerequisites

- Node.js 18+ or Bun 1.0+
- macOS / Windows / Linux

### Development Commands

```bash
bun install            # Install dependencies
bun start              # Start dev server (with hot reload)
bun run lint           # Lint code
bun run typecheck      # Type check
bun run test           # Run tests
bun run changeset      # Create a changeset
bun run version        # Apply changesets and update CHANGELOG
```

### Build and Package

```bash
bun run download:binaries  # Download runtime binaries (bun, uv)
bun run package            # Create app package (no installer)
bun run make               # Create platform installers
```

### Project Structure

```
amon-agent/
├── src/
│   ├── ai/            # Provider-agnostic AI streaming layer
│   │   ├── providers/ # Built-in providers (Anthropic, OpenAI, Google)
│   │   └── utils/     # Event stream, JSON parsing, overflow detection
│   ├── agent/         # Framework-agnostic Agent class and loop
│   ├── main/          # Electron main process
│   │   ├── agent/     # Electron-specific agent integration
│   │   ├── ipc/       # IPC communication handlers
│   │   ├── store/     # State management and persistence
│   │   ├── tools/     # 8 built-in tools (bash, read, write, edit, etc.)
│   │   ├── skills/    # Skill loading and parsing
│   │   └── workspace/ # User file loading (AGENTS.md, SOUL.md)
│   ├── renderer/      # React renderer process
│   │   ├── components/# UI components
│   │   └── store/     # Zustand state management
│   ├── preload/       # contextBridge IPC bridge
│   ├── shared/        # Shared types, schemas, constants
│   └── locales/       # i18n files (en, zh)
├── resources/
│   ├── icons/         # App icons
│   └── [bun, uv]     # Runtime binaries
├── skills/           # Built-in skills packaged with the app
└── forge.config.ts    # Electron Forge configuration
```

## Architecture

Amon adopts a three-layer agent architecture, with each layer cleanly decoupled:

```
┌─────────────────────────────────────────────┐
│  src/ai/        AI Streaming Layer          │  Provider-agnostic, multi-provider
│                 (Anthropic / OpenAI / Google)│  Unified streaming event model
├─────────────────────────────────────────────┤
│  src/agent/     Agent Core                  │  Framework-agnostic Agent + Loop
│                 (State, Tools, Messages)     │  Dual-loop: tool exec + follow-up
├─────────────────────────────────────────────┤
│  src/main/agent/ Electron Integration       │  AgentService, EventAdapter
│                 (IPC, Push, Persistence)     │  Session management, system prompt
└─────────────────────────────────────────────┘
```

- **AI Layer** (`src/ai/`) — Provider-agnostic streaming abstraction. Global provider registry with 4 built-in providers. Normalizes all responses into a unified `AssistantMessageEvent` stream.
- **Agent Layer** (`src/agent/`) — Framework-agnostic `Agent` class. Dual-loop architecture: inner loop (LLM call -> tool execution -> steering check), outer loop (follow-up queue -> repeat). Tool input validated with Zod schemas.
- **Integration Layer** (`src/main/agent/`) — Wires Agent into Electron. `AgentService` resolves providers, models, skills, and workspace bootstrap files per session. `EventAdapter` bridges agent events to session store mutations and push notifications.

## Tech Stack

<table>
<tr>
<td valign="top" width="50%">

**Core Frameworks**
- Electron — Cross-platform desktop apps
- React 19 — UI framework
- TypeScript — Type safety

**AI Layer**
- Custom provider-agnostic streaming layer
- Anthropic SDK / OpenAI SDK / Google GenAI SDK
- Dual-loop agent architecture (tool execution + follow-up)

**Frontend**
- Tailwind CSS + Shadcn/ui — UI design
- Zustand — State management
- Streamdown — Streaming Markdown rendering

</td>
<td valign="top" width="50%">

**Build Tools**
- Vite — Lightning-fast builds
- Electron Forge — Packaging and distribution
- Bun — Runtime and package manager

**Data & Validation**
- Zod v4 — Runtime type validation and tool input schemas
- Shiki — Code syntax highlighting
- i18next — Internationalization (en, zh)

</td>
</tr>
</table>

## License

This project is open-sourced under the [AGPL-3.0](LICENSE) license.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/liruifengv">@liruifengv</a></sub>
</div>
