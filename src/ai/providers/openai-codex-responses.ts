import type {
	ResponseFunctionToolCall,
	ResponseInput,
	ResponseInputContent,
	ResponseInputImage,
	ResponseInputText,
	ResponseOutputMessage,
	ResponseReasoningItem,
	ResponseStreamEvent,
	Tool as OpenAITool,
} from "openai/resources/responses/responses.js";
import { calculateCost, supportsXhigh } from "../models";
import type {
	Api,
	AssistantMessage,
	Context,
	ImageContent,
	Model,
	SimpleStreamOptions,
	StopReason,
	StreamFunction,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
} from "../types";
import { AssistantMessageEventStream } from "../utils/event-stream";
import { parseStreamingJson } from "../utils/json-parse";
import { sanitizeSurrogates } from "../utils/sanitize-unicode";
import { buildBaseOptions, clampReasoning } from "./simple-options";
import { transformMessages } from "./transform-messages";
import { CODEX_COMPAT_PROMPT } from "./codex-compat-prompt";

interface OpenAICodexResponsesOptions extends SimpleStreamOptions {
	reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

interface CodexRequestBody {
	model: string;
	instructions: string;
	input: ResponseInput;
	stream: true;
	store: false;
	tools?: OpenAITool[];
	tool_choice?: "auto";
	parallel_tool_calls?: boolean;
	temperature?: number;
	reasoning?: {
		effort: "low" | "medium" | "high" | "xhigh";
		summary: "auto";
	};
	text?: {
		verbosity: "medium";
	};
	include?: string[];
	prompt_cache_key?: string;
}

function withCodexPrompt(systemPrompt?: string): string {
	if (!systemPrompt?.trim()) {
		return CODEX_COMPAT_PROMPT;
	}
	return `${CODEX_COMPAT_PROMPT}\n\n${systemPrompt}`;
}

function convertCodexMessages(
	model: Model<Api>,
	context: Context,
): ResponseInput {
	const messages: ResponseInput = [];
	const transformedMessages = transformMessages(context.messages, model);

	for (const msg of transformedMessages) {
		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				messages.push({
					role: "user",
					content: [{ type: "input_text", text: sanitizeSurrogates(msg.content) }],
				});
			} else {
				const content: ResponseInputContent[] = msg.content.map((item): ResponseInputContent => {
					if (item.type === "text") {
						return { type: "input_text", text: sanitizeSurrogates(item.text) } satisfies ResponseInputText;
					}
					return {
						type: "input_image",
						detail: "auto",
						image_url: `data:${item.mimeType};base64,${item.data}`,
					} satisfies ResponseInputImage;
				});
				const filteredContent = !model.input.includes("image")
					? content.filter((c) => c.type !== "input_image")
					: content;
				if (filteredContent.length === 0) continue;
				messages.push({ role: "user", content: filteredContent });
			}
		} else if (msg.role === "assistant") {
			const output: ResponseInput = [];

			for (const block of msg.content) {
				if (block.type === "thinking") {
					if (block.thinkingSignature) {
						const reasoningItem = JSON.parse(block.thinkingSignature) as ResponseReasoningItem;
						output.push(reasoningItem);
					}
				} else if (block.type === "text") {
					const textBlock = block as TextContent;
					output.push({
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: sanitizeSurrogates(textBlock.text), annotations: [] }],
						status: "completed",
					} as unknown as ResponseOutputMessage);
				} else if (block.type === "toolCall") {
					const toolCall = block as ToolCall;
					const [callId] = toolCall.id.split("|");

					output.push({
						type: "function_call",
						call_id: callId,
						name: toolCall.name,
						arguments: JSON.stringify(toolCall.arguments),
					} as ResponseFunctionToolCall);
				}
			}

			if (output.length > 0) {
				messages.push(...output);
			}
		} else if (msg.role === "toolResult") {
			const textResult = msg.content
				.filter((c): c is TextContent => c.type === "text")
				.map((c) => c.text)
				.join("\n");
			const hasImages = msg.content.some((c): c is ImageContent => c.type === "image");
			const hasText = textResult.length > 0;
			const [callId] = msg.toolCallId.split("|");
			messages.push({
				type: "function_call_output",
				call_id: callId,
				output: sanitizeSurrogates(hasText ? textResult : "(see attached image)"),
			});

			if (hasImages && model.input.includes("image")) {
				const contentParts: ResponseInputContent[] = [];
				contentParts.push({ type: "input_text", text: "Attached image(s) from tool result:" } satisfies ResponseInputText);
				for (const block of msg.content) {
					if (block.type === "image") {
						contentParts.push({
							type: "input_image",
							detail: "auto",
							image_url: `data:${block.mimeType};base64,${block.data}`,
						} satisfies ResponseInputImage);
					}
				}
				messages.push({ role: "user", content: contentParts });
			}
		}
	}

	return messages;
}

function convertResponsesTools(tools: Tool[]): OpenAITool[] {
	return tools.map((tool) => ({
		type: "function",
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters as Record<string, unknown>,
		strict: false,
	}));
}

function clampCodexReasoningEffort(
	model: Model<"openai-codex-responses">,
	effort: OpenAICodexResponsesOptions["reasoningEffort"],
) {
	if (!effort || effort === "minimal") {
		return "low";
	}

	if (effort === "xhigh") {
		return supportsXhigh(model) ? "xhigh" : "high";
	}

	return effort;
}

function buildParams(model: Model<"openai-codex-responses">, context: Context, options?: OpenAICodexResponsesOptions): CodexRequestBody {
	const params: CodexRequestBody = {
		model: model.id,
		instructions: sanitizeSurrogates(withCodexPrompt(context.systemPrompt)),
		input: convertCodexMessages(model, context),
		stream: true,
		store: false,
		text: { verbosity: "medium" },
		prompt_cache_key: options?.sessionId,
	};

	if (options?.temperature !== undefined) {
		params.temperature = options.temperature;
	}

	if (context.tools) {
		params.tools = convertResponsesTools(context.tools);
		params.tool_choice = "auto";
		params.parallel_tool_calls = true;
	}

	if (model.reasoning && options?.reasoningEffort) {
		params.reasoning = {
			effort: clampCodexReasoningEffort(model, options.reasoningEffort),
			summary: "auto",
		};
		params.include = ["reasoning.encrypted_content"];
	}

	return params;
}

async function* parseSSEStream(response: Response): AsyncGenerator<ResponseStreamEvent> {
	if (!response.body) {
		throw new Error("Codex backend returned an empty response body");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let dataLines: string[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			buffer += decoder.decode();
			break;
		}
		buffer += decoder.decode(value, { stream: true });

		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const rawLine = buffer.slice(0, newlineIndex);
			buffer = buffer.slice(newlineIndex + 1);
			const line = rawLine.replace(/\r$/, "");

			if (line.length === 0) {
				if (dataLines.length > 0) {
					const data = dataLines.join("\n");
					dataLines = [];
					if (data !== "[DONE]") {
						yield JSON.parse(data) as ResponseStreamEvent;
					}
				}
			} else if (line.startsWith("data:")) {
				dataLines.push(line.slice(5).trimStart());
			}

			newlineIndex = buffer.indexOf("\n");
		}
	}

	if (dataLines.length > 0) {
		const data = dataLines.join("\n");
		if (data !== "[DONE]") {
			yield JSON.parse(data) as ResponseStreamEvent;
		}
	}
}

function mapResponseStatus(status: string | undefined): StopReason {
	if (!status) return "stop";
	switch (status) {
		case "completed": return "stop";
		case "incomplete": return "length";
		case "failed":
		case "cancelled": return "error";
		default: return "stop";
	}
}

async function processCodexResponsesStream(
	responseStream: AsyncIterable<ResponseStreamEvent>,
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	model: Model<Api>,
): Promise<void> {
	let currentItem: ResponseReasoningItem | ResponseOutputMessage | ResponseFunctionToolCall | null = null;
	let currentBlock: ThinkingContent | TextContent | (ToolCall & { partialJson: string }) | null = null;
	const blocks = output.content;
	const blockIndex = () => blocks.length - 1;

	for await (const event of responseStream) {
		if (event.type === "response.output_item.added") {
			const item = event.item;
			if (item.type === "reasoning") {
				currentItem = item;
				currentBlock = { type: "thinking", thinking: "" };
				output.content.push(currentBlock);
				stream.push({ type: "thinking_start", contentIndex: blockIndex(), partial: output });
			} else if (item.type === "message") {
				currentItem = item;
				currentBlock = { type: "text", text: "" };
				output.content.push(currentBlock);
				stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
			} else if (item.type === "function_call") {
				currentItem = item;
				currentBlock = {
					type: "toolCall",
					id: `${item.call_id}|${item.id}`,
					name: item.name,
					arguments: {},
					partialJson: item.arguments || "",
				};
				output.content.push(currentBlock);
				stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
			}
		} else if (event.type === "response.reasoning_summary_part.added") {
			if (currentItem?.type === "reasoning") {
				currentItem.summary = currentItem.summary || [];
				currentItem.summary.push(event.part);
			}
		} else if (event.type === "response.reasoning_summary_text.delta") {
			if (currentItem?.type === "reasoning" && currentBlock?.type === "thinking") {
				currentItem.summary = currentItem.summary || [];
				const lastPart = currentItem.summary[currentItem.summary.length - 1];
				if (lastPart) {
					currentBlock.thinking += event.delta;
					lastPart.text += event.delta;
					stream.push({ type: "thinking_delta", contentIndex: blockIndex(), delta: event.delta, partial: output });
				}
			}
		} else if (event.type === "response.reasoning_summary_part.done") {
			if (currentItem?.type === "reasoning" && currentBlock?.type === "thinking") {
				currentItem.summary = currentItem.summary || [];
				const lastPart = currentItem.summary[currentItem.summary.length - 1];
				if (lastPart) {
					currentBlock.thinking += "\n\n";
					lastPart.text += "\n\n";
					stream.push({ type: "thinking_delta", contentIndex: blockIndex(), delta: "\n\n", partial: output });
				}
			}
		} else if (event.type === "response.content_part.added") {
			if (currentItem?.type === "message") {
				currentItem.content = currentItem.content || [];
				if (event.part.type === "output_text" || event.part.type === "refusal") {
					currentItem.content.push(event.part);
				}
			}
		} else if (event.type === "response.output_text.delta") {
			if (currentItem?.type === "message" && currentBlock?.type === "text") {
				const lastPart = currentItem.content?.[currentItem.content.length - 1];
				if (lastPart?.type === "output_text") {
					currentBlock.text += event.delta;
					lastPart.text += event.delta;
					stream.push({ type: "text_delta", contentIndex: blockIndex(), delta: event.delta, partial: output });
				}
			}
		} else if (event.type === "response.refusal.delta") {
			if (currentItem?.type === "message" && currentBlock?.type === "text") {
				const lastPart = currentItem.content?.[currentItem.content.length - 1];
				if (lastPart?.type === "refusal") {
					currentBlock.text += event.delta;
					lastPart.refusal += event.delta;
					stream.push({ type: "text_delta", contentIndex: blockIndex(), delta: event.delta, partial: output });
				}
			}
		} else if (event.type === "response.function_call_arguments.delta") {
			if (currentItem?.type === "function_call" && currentBlock?.type === "toolCall") {
				currentBlock.partialJson += event.delta;
				currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
				stream.push({ type: "toolcall_delta", contentIndex: blockIndex(), delta: event.delta, partial: output });
			}
		} else if (event.type === "response.function_call_arguments.done") {
			if (currentItem?.type === "function_call" && currentBlock?.type === "toolCall") {
				currentBlock.partialJson = event.arguments;
				currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
			}
		} else if (event.type === "response.output_item.done") {
			const item = event.item;

			if (item.type === "reasoning" && currentBlock?.type === "thinking") {
				currentBlock.thinking = item.summary?.map((s) => s.text).join("\n\n") || "";
				currentBlock.thinkingSignature = JSON.stringify(item);
				stream.push({ type: "thinking_end", contentIndex: blockIndex(), content: currentBlock.thinking, partial: output });
				currentBlock = null;
			} else if (item.type === "message" && currentBlock?.type === "text") {
				currentBlock.text = item.content.map((c) => (c.type === "output_text" ? c.text : c.refusal)).join("");
				currentBlock.textSignature = item.id;
				stream.push({ type: "text_end", contentIndex: blockIndex(), content: currentBlock.text, partial: output });
				currentBlock = null;
			} else if (item.type === "function_call") {
				const args =
					currentBlock?.type === "toolCall" && currentBlock.partialJson
						? parseStreamingJson(currentBlock.partialJson)
						: parseStreamingJson(item.arguments || "{}");
				const toolCall: ToolCall = {
					type: "toolCall",
					id: `${item.call_id}|${item.id}`,
					name: item.name,
					arguments: args,
				};
				currentBlock = null;
				stream.push({ type: "toolcall_end", contentIndex: blockIndex(), toolCall, partial: output });
			}
		} else if (event.type === "response.completed") {
			const response = event.response;
			if (response?.usage) {
				const cachedTokens = response.usage.input_tokens_details?.cached_tokens || 0;
				output.usage = {
					input: (response.usage.input_tokens || 0) - cachedTokens,
					output: response.usage.output_tokens || 0,
					cacheRead: cachedTokens,
					cacheWrite: 0,
					totalTokens: response.usage.total_tokens || 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				};
			}
			calculateCost(model, output.usage);
			output.stopReason = mapResponseStatus(response?.status);
			if (output.content.some((b) => b.type === "toolCall") && output.stopReason === "stop") {
				output.stopReason = "toolUse";
			}
		} else if (event.type === "error") {
			throw new Error(`Error Code ${event.code}: ${event.message}` || "Unknown error");
		} else if (event.type === "response.failed") {
			throw new Error("Unknown error");
		}
	}
}

export const streamOpenAICodexResponses: StreamFunction<"openai-codex-responses", OpenAICodexResponsesOptions> = (
	model: Model<"openai-codex-responses">,
	context: Context,
	options?: OpenAICodexResponsesOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api as Api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const apiKey = options?.apiKey;
			if (!apiKey) {
				throw new Error(`No access token for provider: ${model.provider}`);
			}

			const payload = buildParams(model, context, options);
			options?.onPayload?.(payload);

			const response = await fetch(`${model.baseUrl.replace(/\/$/, "")}/responses`, {
				method: "POST",
				headers: {
					"Accept": "text/event-stream",
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
					...(model.headers || {}),
					...(options?.headers || {}),
				},
				body: JSON.stringify(payload),
				signal: options?.signal,
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			stream.push({ type: "start", partial: output });
			await processCodexResponsesStream(parseSSEStream(response), output, stream, model);

			if (options?.signal?.aborted) {
				throw new Error("Request was aborted");
			}

			if (output.stopReason === "aborted" || output.stopReason === "error") {
				throw new Error("An unknown error occurred");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};

export const streamSimpleOpenAICodexResponses: StreamFunction<"openai-codex-responses", SimpleStreamOptions> = (
	model: Model<"openai-codex-responses">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = options?.apiKey;
	if (!apiKey) {
		throw new Error(`No access token for provider: ${model.provider}`);
	}

	const base = buildBaseOptions(model, options, apiKey);
	const reasoningEffort = supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning);

	return streamOpenAICodexResponses(model, context, {
		...base,
		reasoningEffort,
	});
};
