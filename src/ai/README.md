# @amon/ai

Provider-agnostic AI streaming abstraction layer. Unified interface for calling LLMs across Anthropic, OpenAI, Google, and custom providers.

## Quick Start

```typescript
import { getModel, streamSimple, complete } from "../ai";

const model = getModel("anthropic", "claude-sonnet-4-5");

// Streaming
const stream = streamSimple(model, {
  systemPrompt: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }],
}, { reasoning: "medium", apiKey: "sk-..." });

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}

// Non-streaming
const message = await complete(model, {
  messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }],
}, { apiKey: "sk-..." });

console.log(message.content); // TextContent[]
```

## API Reference

### Stream Functions

Four entry points, all route through the provider registry:

```typescript
// Simple API (recommended) — handles thinking level mapping automatically
function streamSimple(model, context, options?: SimpleStreamOptions): AssistantMessageEventStream;
async function completeSimple(model, context, options?: SimpleStreamOptions): Promise<AssistantMessage>;

// Low-level API — pass provider-native options directly
function stream(model, context, options?: ProviderStreamOptions): AssistantMessageEventStream;
async function complete(model, context, options?: ProviderStreamOptions): Promise<AssistantMessage>;
```

**`Context`** — unified input for all stream functions:

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

**`SimpleStreamOptions`** — high-level options:

```typescript
interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel;           // "minimal" | "low" | "medium" | "high" | "xhigh"
  thinkingBudgets?: ThinkingBudgets;   // per-level token budget overrides
}
```

**`StreamOptions`** — base options shared by all variants:

```typescript
interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
  transport?: "sse" | "websocket" | "auto";
  cacheRetention?: "none" | "short" | "long";
  sessionId?: string;
  headers?: Record<string, string>;
  maxRetryDelayMs?: number;
  metadata?: Record<string, unknown>;
  onPayload?: (payload: unknown) => void;
}
```

### Event Stream

All stream functions return `AssistantMessageEventStream`, an async iterable:

```typescript
const stream = streamSimple(model, context, options);

// Consume events
for await (const event of stream) {
  switch (event.type) {
    case "start":          // Stream started, partial AssistantMessage available
    case "thinking_start": // Thinking block opened at contentIndex
    case "thinking_delta": // Thinking text chunk (event.delta)
    case "thinking_end":   // Thinking block closed (event.content = full text)
    case "text_start":     // Text block opened at contentIndex
    case "text_delta":     // Text chunk (event.delta)
    case "text_end":       // Text block closed (event.content = full text)
    case "toolcall_start": // Tool call block opened at contentIndex
    case "toolcall_delta": // Tool call argument chunk (event.delta)
    case "toolcall_end":   // Tool call completed (event.toolCall)
    case "done":           // Success (event.message = final AssistantMessage)
    case "error":          // Failed/aborted (event.error = error AssistantMessage)
  }
}

// Or await the final result directly
const message = await stream.result();
```

**Event flow**: `start → (thinking_start/delta/end | text_start/delta/end | toolcall_start/delta/end)* → done | error`

### Models

```typescript
import { getModel, getModels, getProviders, calculateCost, supportsXhigh } from "../ai";

// Get a specific model
const model = getModel("anthropic", "claude-opus-4-6");

// List all providers
getProviders();  // ["anthropic", "openai", "google", "zai", "minimax", ...]

// List models for a provider
getModels("openai");  // [Model, Model, ...]

// Calculate cost from usage
calculateCost(model, usage);  // { input, output, cacheRead, cacheWrite, total }

// Check xhigh thinking support
supportsXhigh(model);  // true for claude-opus-4-6, gpt-5
```

**`Model`** shape:

```typescript
interface Model<TApi extends Api = Api> {
  id: string;              // e.g. "claude-sonnet-4-5"
  name: string;            // e.g. "Claude Sonnet 4.5"
  api: TApi;               // "anthropic-messages" | "openai-completions" | ...
  provider: Provider;      // "anthropic" | "openai" | ...
  baseUrl: string;
  reasoning: boolean;      // supports thinking/reasoning
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };  // per 1M tokens
  contextWindow: number;
  maxTokens: number;
}
```

Built-in providers and their API mapping:

| Provider | Api | Notes |
|----------|-----|-------|
| `anthropic` | `anthropic-messages` | 17 models |
| `openai` | `openai-responses` | 11 models |
| `google` | `google-generative-ai` | 5 models |
| `zai` | `anthropic-messages` | Anthropic-compatible |
| `minimax` / `minimax-cn` | `anthropic-messages` | Anthropic-compatible |
| `kimi-coding` | `anthropic-messages` | Anthropic-compatible |

### Provider Registry

Register custom providers or override built-in ones:

```typescript
import { registerApiProvider, getApiProvider, unregisterApiProviders } from "../ai";
import type { ApiProvider } from "../ai";

// Register a custom provider
const myProvider: ApiProvider<"my-api"> = {
  api: "my-api",
  stream(model, context, options) { /* ... */ },
  streamSimple(model, context, options) { /* ... */ },
};
registerApiProvider(myProvider, "my-source-id");

// Unregister by source
unregisterApiProviders("my-source-id");
```

### Message Types

```typescript
// Three message roles
type Message = UserMessage | AssistantMessage | ToolResultMessage;

// User message
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

// Assistant message (LLM response)
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api; provider: Provider; model: string;
  usage: Usage; stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

// Tool result (returned after tool execution)
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string; toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  timestamp: number;
}
```

**Content blocks**:

```typescript
interface TextContent     { type: "text"; text: string }
interface ThinkingContent { type: "thinking"; thinking: string; thinkingSignature?: string }
interface ToolCall         { type: "toolCall"; id: string; name: string; arguments: Record<string, any> }
interface ImageContent    { type: "image"; data: string; mimeType: string }
```

**`StopReason`**: `"stop" | "length" | "toolUse" | "error" | "aborted"`

### Tool Definition

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}
```

### Utilities

```typescript
import { isContextOverflow, parseStreamingJson, sanitizeSurrogates } from "../ai";

// Detect context window overflow (supports all major providers)
isContextOverflow(assistantMessage, contextWindow?);  // boolean

// Parse incomplete streaming JSON (graceful fallback to {})
parseStreamingJson<T>(partialJsonString);

// Remove unpaired Unicode surrogates
sanitizeSurrogates(text);
```

## Tool Call Flow Example

```typescript
import { getModel, streamSimple } from "../ai";
import type { Tool, Message } from "../ai";

const model = getModel("anthropic", "claude-sonnet-4-5");
const tools: Tool[] = [{
  name: "get_weather",
  description: "Get weather for a city",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
}];

const messages: Message[] = [
  { role: "user", content: "What's the weather in Tokyo?", timestamp: Date.now() },
];

// First turn: LLM requests tool call
const stream1 = streamSimple(model, { messages, tools }, { apiKey: "sk-..." });
const response1 = await stream1.result();
// response1.stopReason === "toolUse"
// response1.content includes ToolCall { name: "get_weather", arguments: { city: "Tokyo" } }

const toolCall = response1.content.find(c => c.type === "toolCall")!;

// Add assistant response + tool result, then continue
messages.push(response1);
messages.push({
  role: "toolResult",
  toolCallId: toolCall.id,
  toolName: toolCall.name,
  content: [{ type: "text", text: "Sunny, 25°C" }],
  isError: false,
  timestamp: Date.now(),
});

// Second turn: LLM generates final answer
const stream2 = streamSimple(model, { messages, tools }, { apiKey: "sk-..." });
const response2 = await stream2.result();
// response2.stopReason === "stop"
```
