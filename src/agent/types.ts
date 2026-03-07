import type {
	Message,
	AssistantMessage,
	ToolResultMessage,
	Model,
	ThinkingLevel,
	SimpleStreamOptions,
	AssistantMessageEvent,
	Tool,
} from "../ai";

// ==================== Agent Tool ====================

/** AgentTool extends the ai-layer Tool with execution capability. */
export interface AgentTool<TParams = any, TDetails = any> extends Tool {
	/** UI display name. */
	label: string;
	execute: (
		toolCallId: string,
		params: TParams,
		signal?: AbortSignal,
		onUpdate?: (update: AgentToolUpdate<TDetails>) => void,
	) => Promise<AgentToolResult<TDetails>>;
}

export interface AgentToolResult<TDetails = any> {
	content: string | { type: "text"; text: string }[];
	details?: TDetails;
	isError?: boolean;
}

export interface AgentToolUpdate<TDetails = any> {
	content?: string;
	details?: TDetails;
}

// ==================== Agent Messages ====================

/**
 * Agent-layer message: ai Messages (UserMessage | AssistantMessage | ToolResultMessage).
 * No separate AgentToolResultMessage — we use the ai-layer ToolResultMessage directly.
 */
export type AgentMessage = Message;

// ==================== Agent Events ====================

export type AgentEvent =
	| { type: "message_start"; message: AssistantMessage }
	| { type: "message_update"; message: AssistantMessage; event: AssistantMessageEvent }
	| { type: "message_end"; message: AssistantMessage }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string }
	| { type: "tool_execution_update"; toolCallId: string; update: AgentToolUpdate }
	| { type: "tool_execution_end"; toolCallId: string; result: ToolResultMessage }
	| { type: "turn_end"; turnIndex: number }
	| { type: "agent_end"; messages: AgentMessage[] };

// ==================== Agent State ====================

export interface AgentState {
	systemPrompt: string;
	model: Model;
	thinkingLevel: ThinkingLevel | undefined;
	tools: AgentTool[];
	messages: AgentMessage[];
	isStreaming: boolean;
	streamMessage: AssistantMessage | null;
	pendingToolCalls: Set<string>;
	error?: string;
}

// ==================== Agent Loop Config ====================

export interface AgentLoopConfig {
	model: Model;
	systemPrompt: string;
	tools: AgentTool[];
	maxTurns: number;
	streamOptions?: Partial<SimpleStreamOptions>;
	/** Convert agent messages to ai-layer Messages for the LLM. May be async. */
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	/** Optional context transform (trimming, injection). May be async. */
	transformContext?: (messages: AgentMessage[]) => AgentMessage[] | Promise<AgentMessage[]>;
	/** Return steering messages to inject immediately, interrupting tool execution. */
	getSteeringMessages?: () => AgentMessage[] | undefined;
	/** Return follow-up messages to process after the current loop completes. */
	getFollowUpMessages?: () => AgentMessage[] | undefined;
	/** Resolve API key (may refresh expired tokens). */
	resolveApiKey?: () => string | Promise<string>;
}
