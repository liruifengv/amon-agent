# @amon/agent

Agentic loop built on top of `@amon/ai`. Handles multi-turn tool calling, steering, follow-up, and abort with a simple event-driven interface.

## Quick Start

```typescript
import { Agent } from "../agent";
import type { AgentTool } from "../agent";
import { getModel } from "../ai";
import { z } from "zod";

// Define tools with Zod schemas
const readFileTool: AgentTool<{ path: string }> = {
  name: "read_file",
  description: "Read file contents",
  label: "Read File",
  inputSchema: z.object({ path: z.string() }),
  async execute(toolCallId, input, ctx) {
    const content = await fs.readFile(path.resolve(ctx.cwd, input.path), "utf-8");
    return { content: [{ type: "text", text: content }], details: {} };
  },
};

// Create agent
const agent = new Agent({
  getApiKey: () => process.env.ANTHROPIC_API_KEY,
});
agent.setModel(getModel("anthropic", "claude-sonnet-4-5"));
agent.setSystemPrompt("You are a coding assistant.");
agent.setTools([readFileTool]);
agent.setThinkingLevel("medium");

// Subscribe to events
const unsub = agent.subscribe((event) => {
  switch (event.type) {
    case "message_update":
      const e = event.assistantMessageEvent;
      if (e?.type === "text_delta") process.stdout.write(e.delta);
      break;
    case "tool_execution_start":
      console.log(`Running ${event.toolName}...`);
      break;
    case "tool_execution_end":
      console.log(`${event.toolName} done (error: ${event.isError})`);
      break;
  }
});

// Send a prompt — agent loops automatically until no more tool calls
await agent.prompt("Read the package.json and summarize it.");

// Clean up
unsub();
```

## API Reference

### Agent Class

#### Constructor

```typescript
new Agent(opts?: AgentOptions)
```

**`AgentOptions`**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `initialState` | `Partial<AgentState>` | — | Override default state |
| `convertToLlm` | `(msgs: AgentMessage[]) => Message[]` | filter user/assistant/toolResult | Convert agent messages to LLM messages |
| `transformContext` | `(msgs, signal?) => Promise<AgentMessage[]>` | — | Pre-process context before LLM call (trim, inject) |
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How steering messages are dequeued |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | How follow-up messages are dequeued |
| `streamFn` | `StreamFn` | `streamSimple` | Custom stream function |
| `sessionId` | `string` | — | Session ID for provider caching |
| `getApiKey` | `(provider: string) => string \| undefined` | — | Dynamic API key resolver |
| `thinkingBudgets` | `ThinkingBudgets` | — | Per-level thinking token budgets |
| `transport` | `"sse" \| "websocket" \| "auto"` | `"sse"` | Preferred transport |
| `maxRetryDelayMs` | `number` | — | Max retry delay; 0 to disable |

#### Core Methods

```typescript
// Send a message — runs the full agent loop (LLM → tool calls → LLM → ... → stop)
await agent.prompt("Hello!");
await agent.prompt(userMessage);     // AgentMessage
await agent.prompt([msg1, msg2]);    // AgentMessage[]

// Continue from current context (retry, process queued steering/followUp)
await agent.continue();

// Abort current run
agent.abort();

// Wait for current prompt to finish
await agent.waitForIdle();

// Reset everything (messages, queues, streaming state)
agent.reset();
```

#### State Management

```typescript
// Getters
agent.state                // AgentState (read-only snapshot)
agent.state.messages       // all messages so far
agent.state.isStreaming     // currently running?
agent.state.streamMessage   // partial message during streaming
agent.state.pendingToolCalls  // Set<string> of executing tool call IDs

// Setters
agent.setSystemPrompt("You are...");
agent.setModel(getModel("openai", "gpt-5"));
agent.setThinkingLevel("high");       // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
agent.setTools([tool1, tool2]);
agent.setTransport("websocket");

// Message management
agent.replaceMessages(newMessages);
agent.appendMessage(msg);
agent.clearMessages();
```

#### Steering & Follow-Up

Steering interrupts tool execution mid-turn. Follow-up continues after the agent stops.

```typescript
// Queue messages
agent.steer(userMessage);     // interrupts between tool calls
agent.followUp(userMessage);  // continues after agent stops

// Queue management
agent.hasQueuedMessages();     // boolean
agent.clearSteeringQueue();
agent.clearFollowUpQueue();
agent.clearAllQueues();

// Dequeue modes: "all" (flush entire queue) vs "one-at-a-time" (pop one)
agent.setSteeringMode("all");
agent.setFollowUpMode("one-at-a-time");
```

#### Events

```typescript
const unsub = agent.subscribe((event: AgentEvent) => { ... });
unsub(); // unsubscribe
```

### AgentEvent Types

```
agent_start
  turn_start
    message_start { message }
    message_update { message, assistantMessageEvent }  // repeated for each delta
    message_end { message }
    tool_execution_start { toolCallId, toolName, args }
    tool_execution_update { toolCallId, toolName, args, partialResult }
    tool_execution_end { toolCallId, toolName, result, isError }
  turn_end { message, toolResults }
agent_end { messages }
```

Full type:

```typescript
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean }
```

`message_update` carries the raw `AssistantMessageEvent` from the AI layer, allowing fine-grained streaming UI:

```typescript
agent.subscribe((e) => {
  if (e.type === "message_update") {
    const aiEvent = e.assistantMessageEvent;
    if (aiEvent.type === "text_delta") {
      // render streaming text
    } else if (aiEvent.type === "thinking_delta") {
      // render thinking indicator
    }
  }
});
```

### AgentTool

Tools use **Zod schemas** for input validation. Schemas are converted to JSON Schema at the LLM call boundary via `z.toJSONSchema()`.

```typescript
interface AgentTool<TInput = any, TDetails = any> {
  name: string;
  description: string;       // sent to LLM
  label: string;             // UI display label
  inputSchema: z.ZodType<TInput>;
  execute: (
    toolCallId: string,
    input: TInput,            // Zod-validated
    context: ToolExecutionContext,
  ) => Promise<AgentToolResult<TDetails>>;
}

interface ToolExecutionContext {
  cwd: string;
  signal?: AbortSignal;
  onUpdate?: (partialResult: AgentToolResult) => void;  // streaming tool progress
}

interface AgentToolResult<T = any> {
  content: (TextContent | ImageContent)[];  // returned to LLM
  details: T;                               // app-layer metadata
}
```

Example tool with streaming updates:

```typescript
const bashTool: AgentTool<{ command: string }, { exitCode: number }> = {
  name: "bash",
  description: "Execute a shell command",
  label: "Bash",
  inputSchema: z.object({ command: z.string() }),
  async execute(toolCallId, input, ctx) {
    const proc = spawn(input.command, { cwd: ctx.cwd, signal: ctx.signal });
    let output = "";
    proc.stdout.on("data", (chunk) => {
      output += chunk;
      ctx.onUpdate?.({
        content: [{ type: "text", text: output }],
        details: { exitCode: -1 },
      });
    });
    const exitCode = await new Promise<number>((res) => proc.on("exit", res));
    return {
      content: [{ type: "text", text: output }],
      details: { exitCode },
    };
  },
};
```

### AgentState

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;          // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  isStreaming: boolean;
  streamMessage: AgentMessage | null;    // partial message during streaming
  pendingToolCalls: Set<string>;         // currently executing tool call IDs
  error?: string;
}
```

### Low-Level Loop Functions

For advanced use cases (custom Agent implementations):

```typescript
import { agentLoop, agentLoopContinue } from "../agent";

// Start a new loop with initial messages
const stream = agentLoop(
  prompts,    // AgentMessage[] — initial messages to send
  context,    // AgentContext { systemPrompt, messages, tools }
  config,     // AgentLoopConfig
  signal?,    // AbortSignal
  streamFn?,  // custom stream function
);

// Continue from existing context (last message must not be assistant)
const stream = agentLoopContinue(context, config, signal?, streamFn?);

// Both return EventStream<AgentEvent, AgentMessage[]>
for await (const event of stream) { /* handle events */ }
const allMessages = await stream.result();
```

**`AgentLoopConfig`**:

```typescript
interface AgentLoopConfig extends SimpleStreamOptions {
  model: Model<any>;
  cwd?: string;
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?) => Promise<AgentMessage[]>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  getSteeringMessages?: () => Promise<AgentMessage[]>;
  getFollowUpMessages?: () => Promise<AgentMessage[]>;
}
```

### Custom Message Types

Extend `AgentMessage` via TypeScript declaration merging:

```typescript
// In your app's type declarations
declare module "../agent/types" {
  interface CustomAgentMessages {
    system: { role: "system"; content: string; timestamp: number };
  }
}

// Now AgentMessage = Message | { role: "system"; ... }
// Use convertToLlm to filter/transform custom messages before LLM calls
```

## Architecture

### Dual-Loop Design

```
Outer loop (follow-up)
  │
  └─ Inner loop (tool calls + steering)
       │
       ├─ 1. Inject pending messages (steering / follow-up)
       ├─ 2. Call LLM (streamAssistantResponse)
       ├─ 3. Check stopReason → break on error/aborted
       ├─ 4. Extract tool calls from response
       ├─ 5. Execute tool calls sequentially
       │     └─ Check steering after each → skip remaining if interrupted
       ├─ 6. Emit turn_end
       └─ 7. Check for new steering → continue inner loop
  │
  ├─ Check follow-up queue → continue outer loop if messages
  └─ Emit agent_end
```

### Call Chain

```
Agent.prompt(input)
  → agentLoop(prompts, context, config, signal)
    → streamAssistantResponse():
        transformContext(messages)       // optional: trim/inject
        convertToLlm(messages)          // AgentMessage[] → Message[]
        z.toJSONSchema(tool.inputSchema) // Zod → JSON Schema
        streamSimple(model, context, options)  ← calls ai layer
    → executeToolCalls():
        tool.inputSchema.safeParse()    // Zod validation
        tool.execute()                  // run tool
        check steering → skip remaining if interrupted
```
