import type {
	AssistantMessage,
	TextContent,
	ThinkingContent,
	ToolCall,
	ToolResultMessage,
	Usage,
	UserMessage,
} from "@/ai/types";

export function createUsage(overrides?: Partial<Usage>): Usage {
	return {
		input: 100,
		output: 50,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 150,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		...overrides,
	};
}

export function createUserMessage(content: string | (TextContent)[], overrides?: Partial<UserMessage>): UserMessage {
	return {
		role: "user",
		content,
		timestamp: Date.now(),
		...overrides,
	};
}

export function createAssistantMessage(
	content: (TextContent | ThinkingContent | ToolCall)[],
	overrides?: Partial<AssistantMessage>,
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test-model",
		usage: createUsage(),
		stopReason: "stop",
		timestamp: Date.now(),
		...overrides,
	};
}

export function createToolCallContent(overrides?: Partial<ToolCall>): ToolCall {
	return {
		type: "toolCall",
		id: `tc_${Math.random().toString(36).slice(2, 8)}`,
		name: "test_tool",
		arguments: {},
		...overrides,
	};
}

export function createThinkingContent(text: string, overrides?: Partial<ThinkingContent>): ThinkingContent {
	return {
		type: "thinking",
		thinking: text,
		...overrides,
	};
}

export function createToolResultMessage(
	toolCallId: string,
	content: string,
	overrides?: Partial<ToolResultMessage>,
): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId,
		toolName: "test_tool",
		content: [{ type: "text", text: content }],
		isError: false,
		timestamp: Date.now(),
		...overrides,
	};
}
