---
"amon-agent": patch
---

Add a built-in `AskUserQuestion` tool for blocking agent clarifications during a run.

### Highlights

- Add the new `AskUserQuestion` tool so the agent can pause for one user answer and then continue the same run automatically.
- Add main-process question request lifecycle handling, including in-memory pending state, IPC handlers, push events, and abort cleanup.
- Add renderer question UI and session-scoped question state so users can answer or dismiss requests without sending a normal chat message.
- Show `AskUserQuestion` progress and resolved answers in tool execution history.
- Update prompts, shared types, and tests to support the new question flow end to end.
