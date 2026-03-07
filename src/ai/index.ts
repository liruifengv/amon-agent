// ==================== Types ====================

export type {
	KnownApi,
	Api,
	KnownProvider,
	Provider,
	Model,
	OpenAICompletionsCompat,
	OpenAIResponsesCompat,
	TextContent,
	ThinkingContent,
	ImageContent,
	ToolCall,
	ServerToolDef,
	UserMessage,
	AssistantMessage,
	ToolResultMessage,
	Message,
	Usage,
	StopReason,
	ThinkingLevel,
	ThinkingBudgets,
	CacheRetention,
	Transport,
	AssistantMessageEvent,
	Tool,
	Context,
	StreamOptions,
	ProviderStreamOptions,
	SimpleStreamOptions,
	StreamFunction,
} from "./types";

// ==================== Event Stream ====================

export { EventStream, AssistantMessageEventStream, createAssistantMessageEventStream } from "./utils/event-stream";

// ==================== Models ====================

export {
	getModel,
	getProviders,
	getModels,
	calculateCost,
	supportsXhigh,
	modelsAreEqual,
} from "./models";

// ==================== API Registry ====================

export {
	registerApiProvider,
	getApiProvider,
	getApiProviders,
	unregisterApiProviders,
	clearApiProviders,
} from "./api-registry";
export type { ApiProvider } from "./api-registry";

// ==================== Stream ====================

export { stream, streamSimple, complete, completeSimple } from "./stream";

// ==================== Utils ====================

export { isContextOverflow, getOverflowPatterns } from "./utils/overflow";
export { parseStreamingJson } from "./utils/json-parse";
export { sanitizeSurrogates } from "./utils/sanitize-unicode";

// ==================== Built-in Provider Registration ====================

export { registerBuiltinProviders, resetApiProviders } from "./providers/register-builtins";
