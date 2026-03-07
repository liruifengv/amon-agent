import type {
	AssistantMessage,
	ToolCall,
	ToolResultMessage,
	StreamFunction,
	Context,
} from "../ai";
import { EventStream } from "../ai/utils/event-stream";
import { streamSimple } from "../ai/stream";
import type {
	AgentMessage,
	AgentEvent,
	AgentLoopConfig,
	AgentToolUpdate,
} from "./types";
import { validateToolArguments } from "./validation";

/**
 * Start a new agentic loop with user prompt messages.
 * Returns an EventStream that emits AgentEvents and completes with the final messages array.
 */
export function agentLoop(
	prompts: AgentMessage[],
	context: AgentMessage[],
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFunction,
): EventStream<AgentEvent, AgentMessage[]> {
	const stream = new EventStream<AgentEvent, AgentMessage[]>(
		(event) => event.type === "agent_end",
		(event) => (event as Extract<AgentEvent, { type: "agent_end" }>).messages,
	);
	const allMessages = [...context, ...prompts];
	runLoop(stream, allMessages, config, signal, streamFn);
	return stream;
}

/**
 * Continue an existing agentic loop from existing context (no new prompts).
 */
export function agentLoopContinue(
	context: AgentMessage[],
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFunction,
): EventStream<AgentEvent, AgentMessage[]> {
	const stream = new EventStream<AgentEvent, AgentMessage[]>(
		(event) => event.type === "agent_end",
		(event) => (event as Extract<AgentEvent, { type: "agent_end" }>).messages,
	);
	runLoop(stream, [...context], config, signal, streamFn);
	return stream;
}

async function runLoop(
	stream: EventStream<AgentEvent, AgentMessage[]>,
	messages: AgentMessage[],
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFunction,
): Promise<void> {
	try {
		let turnIndex = 0;

		// Outer loop: handles follow-up messages
		// eslint-disable-next-line no-constant-condition
		outer: while (true) {
			// Inner loop: handles tool calls and steering
			// eslint-disable-next-line no-constant-condition
			while (true) {
				if (signal?.aborted) {
					break outer;
				}

				turnIndex++;
				if (turnIndex > config.maxTurns) {
					break outer;
				}

				// 1. Check/inject steering messages
				const steeringMessages = config.getSteeringMessages?.();
				if (steeringMessages && steeringMessages.length > 0) {
					messages.push(...steeringMessages);
				}

				// 2. Stream assistant response
				const assistantMessage = await streamAssistantResponse(
					messages, config, streamFn, signal, stream,
				);

				messages.push(assistantMessage);

				// 3. Check for error/aborted — terminate loop immediately
				if (assistantMessage.stopReason === "error" || assistantMessage.stopReason === "aborted") {
					stream.push({ type: "turn_end", turnIndex });
					break outer;
				}

				// 4. Extract tool calls from assistant message
				const toolCalls = extractToolCalls(assistantMessage);

				if (toolCalls.length === 0 || assistantMessage.stopReason !== "toolUse") {
					stream.push({ type: "turn_end", turnIndex });
					break; // Exit inner loop
				}

				// 5. Execute tool calls sequentially
				const steeringInterrupted = await executeToolCalls(
					toolCalls, messages, config, signal, stream,
				);

				stream.push({ type: "turn_end", turnIndex });

				if (steeringInterrupted) {
					break; // Steering interrupted tool execution
				}
			}

			// Check for follow-up messages
			const followUpMessages = config.getFollowUpMessages?.();
			if (followUpMessages && followUpMessages.length > 0) {
				messages.push(...followUpMessages);
				continue; // Continue outer loop with follow-up
			}

			break; // No follow-ups, exit outer loop
		}

		stream.push({ type: "agent_end", messages });
		stream.end(messages);
	} catch (err) {
		stream.end(messages);
	}
}

async function streamAssistantResponse(
	messages: AgentMessage[],
	config: AgentLoopConfig,
	streamFn: StreamFunction | undefined,
	signal: AbortSignal | undefined,
	output: EventStream<AgentEvent, AgentMessage[]>,
): Promise<AssistantMessage> {
	// Apply transformContext if provided (may be async)
	const contextMessages = config.transformContext
		? await config.transformContext(messages)
		: messages;

	// Convert to LLM messages (may be async)
	const llmMessages = await config.convertToLlm(contextMessages);

	// Build tool definitions for the context
	const tools = config.tools.map((t) => ({
		name: t.name,
		description: t.description,
		parameters: t.parameters,
	}));

	// Resolve API key
	const apiKey = config.resolveApiKey
		? await config.resolveApiKey()
		: config.streamOptions?.apiKey ?? "";

	// Build Context object
	const context: Context = {
		systemPrompt: config.systemPrompt,
		messages: llmMessages,
		tools: tools.length > 0 ? tools : undefined,
	};

	// Build stream options
	const options = {
		...config.streamOptions,
		apiKey,
		signal,
	};

	// Call stream function: (model, context, options?)
	const fn = streamFn ?? streamSimple;
	const eventStream = fn(config.model, context, options);

	// Consume the stream events and build the final AssistantMessage
	let assistantMessage: AssistantMessage | null = null;
	let started = false;

	for await (const event of eventStream) {
		switch (event.type) {
			case "start":
				assistantMessage = event.partial;
				started = true;
				output.push({ type: "message_start", message: assistantMessage });
				break;

			case "text_start":
			case "text_delta":
			case "text_end":
			case "thinking_start":
			case "thinking_delta":
			case "thinking_end":
			case "toolcall_start":
			case "toolcall_delta":
			case "toolcall_end":
				assistantMessage = event.partial;
				if (started) {
					output.push({ type: "message_update", message: assistantMessage, event });
				}
				break;

			case "done":
				assistantMessage = event.message;
				output.push({ type: "message_end", message: assistantMessage });
				break;

			case "error":
				assistantMessage = event.error;
				output.push({ type: "message_end", message: assistantMessage });
				break;
		}
	}

	// Get the final result from the stream
	const finalMessage = await eventStream.result();
	return finalMessage ?? assistantMessage!;
}

function extractToolCalls(message: AssistantMessage): ToolCall[] {
	if (!message.content) return [];
	return message.content.filter(
		(block): block is ToolCall => block.type === "toolCall",
	);
}

async function executeToolCalls(
	toolCalls: ToolCall[],
	messages: AgentMessage[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	output: EventStream<AgentEvent, AgentMessage[]>,
): Promise<boolean> {
	let steeringInterrupted = false;
	let interrupted = false;

	for (let i = 0; i < toolCalls.length; i++) {
		const toolCall = toolCalls[i];

		// Check abort
		if (signal?.aborted) {
			// Generate skip results for remaining tool calls
			for (let j = i; j < toolCalls.length; j++) {
				const skipResult = makeToolResult(
					toolCalls[j].id,
					toolCalls[j].name,
					"Tool execution was aborted.",
					true,
				);
				output.push({ type: "tool_execution_end", toolCallId: toolCalls[j].id, result: skipResult });
				messages.push(skipResult);
			}
			break;
		}

		// If steering interrupted, skip remaining tool calls
		if (interrupted) {
			const skipResult = makeToolResult(
				toolCall.id,
				toolCall.name,
				"Tool execution was skipped due to steering interruption.",
				true,
			);
			output.push({ type: "tool_execution_end", toolCallId: toolCall.id, result: skipResult });
			messages.push(skipResult);
			continue;
		}

		// Find the tool
		const tool = config.tools.find((t) => t.name === toolCall.name);

		if (!tool) {
			const errorResult = makeToolResult(
				toolCall.id,
				toolCall.name,
				`Tool "${toolCall.name}" not found.`,
				true,
			);
			output.push({ type: "tool_execution_end", toolCallId: toolCall.id, result: errorResult });
			messages.push(errorResult);
			continue;
		}

		// Validate parameters — now uses toolCall.arguments
		const validation = validateToolArguments(tool.parameters, toolCall.arguments);
		if (!validation.valid) {
			const errorResult = makeToolResult(
				toolCall.id,
				toolCall.name,
				`Invalid parameters: ${validation.errors!.join("; ")}`,
				true,
			);
			output.push({ type: "tool_execution_end", toolCallId: toolCall.id, result: errorResult });
			messages.push(errorResult);
			continue;
		}

		// Emit start
		output.push({ type: "tool_execution_start", toolCallId: toolCall.id, toolName: toolCall.name });

		// Execute
		try {
			const onUpdate = (update: AgentToolUpdate) => {
				output.push({ type: "tool_execution_update", toolCallId: toolCall.id, update });
			};

			const result = await tool.execute(toolCall.id, toolCall.arguments, signal, onUpdate);

			const resultContent = typeof result.content === "string"
				? result.content
				: result.content.map((c) => c.text).join("\n");

			const toolResultMessage = makeToolResult(
				toolCall.id,
				toolCall.name,
				resultContent,
				result.isError ?? false,
			);

			output.push({ type: "tool_execution_end", toolCallId: toolCall.id, result: toolResultMessage });
			messages.push(toolResultMessage);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorResult = makeToolResult(
				toolCall.id,
				toolCall.name,
				`Tool execution error: ${errorMessage}`,
				true,
			);
			output.push({ type: "tool_execution_end", toolCallId: toolCall.id, result: errorResult });
			messages.push(errorResult);
		}

		// After each tool, check for steering messages
		const steeringMessages = config.getSteeringMessages?.();
		if (steeringMessages && steeringMessages.length > 0) {
			messages.push(...steeringMessages);
			steeringInterrupted = true;
			interrupted = true;
			// Don't break — continue loop to generate skip results for remaining tool calls
		}
	}

	return steeringInterrupted;
}

/** Helper to create a ToolResultMessage. */
function makeToolResult(
	toolCallId: string,
	toolName: string,
	content: string,
	isError: boolean,
): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text: content }],
		isError,
		timestamp: Date.now(),
	};
}
