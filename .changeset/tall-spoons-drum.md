---
"amon-agent": patch
---

Refine conversation compaction behavior and configuration.

Compaction summaries now require a validated XML structure, which makes the compacted handoff more predictable for later turns. Automatic compaction also uses a safer boundary that keeps a recent user-led tail instead of trimming into an incomplete turn. In settings, the redundant `compaction.enabled` flag is folded into `compaction.autoCompact` while preserving backward compatibility for existing configs.
