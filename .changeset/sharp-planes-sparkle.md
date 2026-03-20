---
"amon-agent": patch
---

Fix workspace file mentions and path validation.

File mention suggestions now load from the active session workspace instead of an empty IPC placeholder response. Mentioned `@path` entries are also validated against the real workspace before the UI highlights them as existing files.
