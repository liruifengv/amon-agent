---
"amon-agent": minor
---

Add automatic conversation compaction for long-running sessions.

This release persists per-session compaction snapshots, rebuilds active LLM context from a compact summary plus recent history, automatically compacts when context usage approaches the model limit, and recovers from context overflow errors by compacting and retrying. The UI now also shows a real compaction notice when this happens.
