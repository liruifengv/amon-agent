---
"amon-agent": patch
---

Enhance skill uninstall to support multiple configured skill directories.

The uninstall feature now uses the resolved directory path instead of skill name, allowing skills to be removed from workspace `.amon/skills`, user `~/.amon/skills`, and any configured `extraDirs`. Added safety validation to prevent deletion outside allowed skill roots.
