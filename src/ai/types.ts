import type { AssistantMessageEventStream } from "./utils/event-stream";

export type { AssistantMessageEventStream } from "./utils/event-stream";

// ==================== API & Provider Identifiers ====================

export type KnownApi =
	| "anthropic-messages"
	| "openai-completions"
	| "openai-responses"
	| "google-generative-ai";

// eslint-disable-next-line @typescript-eslint/ban-types
export type Api = KnownApi | (string & {});

export type KnownProvider =
	| "anthropic"
	| "openai"
	| "google"
	| "minimax"
	| "minimax-cn"
	| "kimi-coding"
	| "zai";

export type Provider = KnownProvider | string;

// ==================== Thinking ====================

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

/** Token budgets for each thinking level (token-based providers only) */
export interface ThinkingBudgets {
	minimal?: number;
	low?: number;
	medium?: number;
	high?: number;
}

// ==================== Stream Options ====================

export type CacheRetention = "none" | "short" | "long";

export type Transport = "sse" | "websocket" | "auto";

export interface StreamOptions {
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
	apiKey?: string;
	transport?: Transport;
	cacheRetention?: CacheRetention;
	sessionId?: string;
	onPayload?: (payload: unknown) => void;
	headers?: Record<string, string>;
	maxRetryDelayMs?: number;
	metadata?: Record<string, unknown>;
}

export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;

export interface SimpleStreamOptions extends StreamOptions {
	reasoning?: ThinkingLevel;
	thinkingBudgets?: ThinkingBudgets;
}

export type StreamFunction<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> = (
	model: Model<TApi>,
	context: Context,
	options?: TOptions,
) => AssistantMessageEventStream;

// ==================== Content Types ====================

export interface TextContent {
	type: "text";
	text: string;
	textSignature?: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
}

export interface ImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, any>;
	thoughtSignature?: string;
}

// ==================== Usage ====================

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

// ==================== Stop Reason ====================

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

// ==================== Messages ====================

export interface UserMessage {
	role: "user";
	content: string | (TextContent | ImageContent)[];
	timestamp: number;
}

export interface AssistantMessage {
	role: "assistant";
	content: (TextContent | ThinkingContent | ToolCall)[];
	api: Api;
	provider: Provider;
	model: string;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	timestamp: number;
}

export interface ToolResultMessage<TDetails = any> {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (TextContent | ImageContent)[];
	details?: TDetails;
	isError: boolean;
	timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// ==================== Tools ====================

export interface Tool {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

// ==================== Context ====================

export interface Context {
	systemPrompt?: string;
	messages: Message[];
	tools?: Tool[];
}

// ==================== Stream Events ====================

export type AssistantMessageEvent =
	| { type: "start"; partial: AssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
	| { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
	| { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

// ==================== OpenAI Compat ====================

export interface OpenAICompletionsCompat {
	supportsStore?: boolean;
	supportsDeveloperRole?: boolean;
	supportsReasoningEffort?: boolean;
	supportsUsageInStreaming?: boolean;
	maxTokensField?: "max_completion_tokens" | "max_tokens";
	requiresToolResultName?: boolean;
	requiresAssistantAfterToolResult?: boolean;
	requiresThinkingAsText?: boolean;
	requiresMistralToolIds?: boolean;
	thinkingFormat?: "openai" | "zai" | "qwen";
	openRouterRouting?: OpenRouterRouting;
	vercelGatewayRouting?: VercelGatewayRouting;
	supportsStrictMode?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OpenAIResponsesCompat {
	// Reserved for future use
}

export interface OpenRouterRouting {
	only?: string[];
	order?: string[];
}

export interface VercelGatewayRouting {
	only?: string[];
	order?: string[];
}

// ==================== Model ====================

export interface Model<TApi extends Api = Api> {
	id: string;
	name: string;
	api: TApi;
	provider: Provider;
	baseUrl: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	compat?: TApi extends "openai-completions"
		? OpenAICompletionsCompat
		: TApi extends "openai-responses"
			? OpenAIResponsesCompat
			: never;
}

// ==================== Amon-specific: Server Tools ====================
// Used internally by anthropic.ts for web search support

export interface ServerToolUse {
	type: "server_tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
	callerType?: string;
	callerToolId?: string;
}

export interface ServerToolResult {
	type: "server_tool_result";
	toolUseId: string;
	resultType: string;
	content: unknown;
	callerType?: string;
	callerToolId?: string;
}

export interface ServerToolDef {
	type: string;
	name: string;
	maxUses?: number;
	allowedDomains?: string[];
	blockedDomains?: string[];
	maxContentTokens?: number;
	userLocation?: {
		type: "approximate";
		city?: string;
		region?: string;
		country?: string;
		timezone?: string;
	};
}
