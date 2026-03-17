---
"amon-agent": patch
---

Add first-class OpenAI Codex OAuth support and provider runtime integration.

### Highlights

- Add a new `openai-codex-responses` provider implementation for Codex-compatible Responses streaming.
- Add provider auth infrastructure in main process:
  - secure local session storage
  - auth strategy abstraction
  - provider auth service with refresh and status push events
- Expose provider auth IPC APIs and preload bridge methods for connect/disconnect/status checks.
- Add settings UI updates for OAuth-based providers, including connect/disconnect flows and status display.
- Extend shared schemas/types/constants to model provider auth configuration and status.
- Add/expand tests for Codex provider streaming and auth service behavior.
