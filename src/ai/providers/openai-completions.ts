import OpenAI from "openai";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionChunk,
	ChatCompletionContentPart,
	ChatCompletionContentPartImage,
	ChatCompletionContentPartText,
	ChatCompletionMessageParam,
	ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";
import { calculateCost, supportsXhigh } from "../models";
import type {
	AssistantMessage,
	Context,
	Message,
	Model,
	OpenAICompletionsCompat,
	SimpleStreamOptions,
	StopReason,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
	ToolResultMessage,
} from "../types";
import { AssistantMessageEventStream } from "../utils/event-stream";
import { parseStreamingJson } from "../utils/json-parse";
import { sanitizeSurrogates } from "../utils/sanitize-unicode";
import { buildBaseOptions, clampReasoning } from "./simple-options";
import { transformMessages } from "./transform-messages";

function normalizeMistralToolId(id: string): string {
	let normalized = id.replace(/[^a-zA-Z0-9]/g, "");
	if (normalized.length < 9) {
		const padding = "ABCDEFGHI";
		normalized = normalized + padding.slice(0, 9 - normalized.length);
	} else if (normalized.length > 9) {
		normalized = normalized.slice(0, 9);
	}
	return normalized;
}

function hasToolHistory(messages: Message[]): boolean {
	for (const msg of messages) {
		if (msg.role === "toolResult") return true;
		if (msg.role === "assistant") {
			if (msg.content.some((block) => block.type === "toolCall")) return true;
		}
	}
	return false;
}

export interface OpenAICompletionsOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
	reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export const streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions> = (
	model: Model<"openai-completions">,
	context: Context,
	options?: OpenAICompletionsOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const apiKey = options?.apiKey || "";
			const client = createClient(model, apiKey, options?.headers);
			const params = buildParams(model, context, options);
			options?.onPayload?.(params);
			const openaiStream = await client.chat.completions.create(params, { signal: options?.signal });
			stream.push({ type: "start", partial: output });

			let currentBlock: TextContent | ThinkingContent | (ToolCall & { partialArgs?: string }) | null = null;
			const blocks = output.content;
			const blockIndex = () => blocks.length - 1;
			const finishCurrentBlock = (block?: typeof currentBlock) => {
				if (block) {
					if (block.type === "text") {
						stream.push({ type: "text_end", contentIndex: blockIndex(), content: block.text, partial: output });
					} else if (block.type === "thinking") {
						stream.push({ type: "thinking_end", contentIndex: blockIndex(), content: block.thinking, partial: output });
					} else if (block.type === "toolCall") {
						block.arguments = parseStreamingJson(block.partialArgs);
						delete block.partialArgs;
						stream.push({ type: "toolcall_end", contentIndex: blockIndex(), toolCall: block, partial: output });
					}
				}
			};

			for await (const chunk of openaiStream) {
				if (chunk.usage) {
					const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
					const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
					const input = (chunk.usage.prompt_tokens || 0) - cachedTokens;
					const outputTokens = (chunk.usage.completion_tokens || 0) + reasoningTokens;
					output.usage = {
						input,
						output: outputTokens,
						cacheRead: cachedTokens,
						cacheWrite: 0,
						totalTokens: input + outputTokens + cachedTokens,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					};
					calculateCost(model, output.usage);
				}

				const choice = chunk.choices[0];
				if (!choice) continue;

				if (choice.finish_reason) {
					output.stopReason = mapStopReason(choice.finish_reason);
				}

				if (choice.delta) {
					if (choice.delta.content !== null && choice.delta.content !== undefined && choice.delta.content.length > 0) {
						if (!currentBlock || currentBlock.type !== "text") {
							finishCurrentBlock(currentBlock);
							currentBlock = { type: "text", text: "" };
							output.content.push(currentBlock);
							stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
						}
						if (currentBlock.type === "text") {
							currentBlock.text += choice.delta.content;
							stream.push({ type: "text_delta", contentIndex: blockIndex(), delta: choice.delta.content, partial: output });
						}
					}

					const reasoningFields = ["reasoning_content", "reasoning", "reasoning_text"];
					let foundReasoningField: string | null = null;
					for (const field of reasoningFields) {
						if ((choice.delta as any)[field] !== null && (choice.delta as any)[field] !== undefined && (choice.delta as any)[field].length > 0) {
							if (!foundReasoningField) {
								foundReasoningField = field;
								break;
							}
						}
					}

					if (foundReasoningField) {
						if (!currentBlock || currentBlock.type !== "thinking") {
							finishCurrentBlock(currentBlock);
							currentBlock = { type: "thinking", thinking: "", thinkingSignature: foundReasoningField };
							output.content.push(currentBlock);
							stream.push({ type: "thinking_start", contentIndex: blockIndex(), partial: output });
						}
						if (currentBlock.type === "thinking") {
							const delta = (choice.delta as any)[foundReasoningField];
							currentBlock.thinking += delta;
							stream.push({ type: "thinking_delta", contentIndex: blockIndex(), delta, partial: output });
						}
					}

					if (choice?.delta?.tool_calls) {
						for (const toolCall of choice.delta.tool_calls) {
							if (!currentBlock || currentBlock.type !== "toolCall" || (toolCall.id && currentBlock.id !== toolCall.id)) {
								finishCurrentBlock(currentBlock);
								currentBlock = {
									type: "toolCall",
									id: toolCall.id || "",
									name: toolCall.function?.name || "",
									arguments: {},
									partialArgs: "",
								};
								output.content.push(currentBlock);
								stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
							}
							if (currentBlock.type === "toolCall") {
								if (toolCall.id) currentBlock.id = toolCall.id;
								if (toolCall.function?.name) currentBlock.name = toolCall.function.name;
								let delta = "";
								if (toolCall.function?.arguments) {
									delta = toolCall.function.arguments;
									currentBlock.partialArgs += toolCall.function.arguments;
									currentBlock.arguments = parseStreamingJson(currentBlock.partialArgs);
								}
								stream.push({ type: "toolcall_delta", contentIndex: blockIndex(), delta, partial: output });
							}
						}
					}

					const reasoningDetails = (choice.delta as any).reasoning_details;
					if (reasoningDetails && Array.isArray(reasoningDetails)) {
						for (const detail of reasoningDetails) {
							if (detail.type === "reasoning.encrypted" && detail.id && detail.data) {
								const matchingToolCall = output.content.find(
									(b) => b.type === "toolCall" && b.id === detail.id,
								) as ToolCall | undefined;
								if (matchingToolCall) {
									matchingToolCall.thoughtSignature = JSON.stringify(detail);
								}
							}
						}
					}
				}
			}

			finishCurrentBlock(currentBlock);

			if (options?.signal?.aborted) {
				throw new Error("Request was aborted");
			}

			if (output.stopReason === "aborted" || output.stopReason === "error") {
				throw new Error("An unknown error occurred");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) delete (block as any).index;
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			const rawMetadata = (error as any)?.error?.metadata?.raw;
			if (rawMetadata) output.errorMessage += `\n${rawMetadata}`;
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};

export const streamSimpleOpenAICompletions: StreamFunction<"openai-completions", SimpleStreamOptions> = (
	model: Model<"openai-completions">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = options?.apiKey;
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}

	const base = buildBaseOptions(model, options, apiKey);
	const reasoningEffort = supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning);
	const toolChoice = (options as OpenAICompletionsOptions | undefined)?.toolChoice;

	return streamOpenAICompletions(model, context, {
		...base,
		reasoningEffort,
		toolChoice,
	} satisfies OpenAICompletionsOptions);
};

function createClient(model: Model<"openai-completions">, apiKey?: string, optionsHeaders?: Record<string, string>) {
	const headers = { ...model.headers };
	if (optionsHeaders) {
		Object.assign(headers, optionsHeaders);
	}

	return new OpenAI({
		apiKey: apiKey || undefined,
		baseURL: model.baseUrl,
		dangerouslyAllowBrowser: true,
		defaultHeaders: headers,
	});
}

function buildParams(model: Model<"openai-completions">, context: Context, options?: OpenAICompletionsOptions) {
	const compat = getCompat(model);
	const messages = convertMessages(model, context, compat);

	const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: model.id,
		messages,
		stream: true,
	};

	if (compat.supportsUsageInStreaming !== false) {
		(params as any).stream_options = { include_usage: true };
	}

	if (compat.supportsStore) {
		params.store = false;
	}

	if (options?.maxTokens) {
		if (compat.maxTokensField === "max_tokens") {
			(params as any).max_tokens = options.maxTokens;
		} else {
			params.max_completion_tokens = options.maxTokens;
		}
	}

	if (options?.temperature !== undefined) {
		params.temperature = options.temperature;
	}

	if (context.tools) {
		params.tools = convertTools(context.tools, compat);
	} else if (hasToolHistory(context.messages)) {
		params.tools = [];
	}

	if (options?.toolChoice) {
		params.tool_choice = options.toolChoice;
	}

	if (compat.thinkingFormat === "zai" && model.reasoning) {
		(params as any).thinking = { type: options?.reasoningEffort ? "enabled" : "disabled" };
	} else if (compat.thinkingFormat === "qwen" && model.reasoning) {
		(params as any).enable_thinking = !!options?.reasoningEffort;
	} else if (options?.reasoningEffort && model.reasoning && compat.supportsReasoningEffort) {
		params.reasoning_effort = options.reasoningEffort;
	}

	return params;
}

function convertMessages(
	model: Model<"openai-completions">,
	context: Context,
	compat: Required<OpenAICompletionsCompat>,
): ChatCompletionMessageParam[] {
	const params: ChatCompletionMessageParam[] = [];

	const normalizeToolCallId = (id: string): string => {
		if (compat.requiresMistralToolIds) return normalizeMistralToolId(id);
		if (id.includes("|")) {
			const [callId] = id.split("|");
			return callId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
		}
		if (model.provider === "openai") return id.length > 40 ? id.slice(0, 40) : id;
		return id;
	};

	const transformedMessages = transformMessages(context.messages, model, (id) => normalizeToolCallId(id));

	if (context.systemPrompt) {
		const useDeveloperRole = model.reasoning && compat.supportsDeveloperRole;
		const role = useDeveloperRole ? "developer" : "system";
		params.push({ role: role, content: sanitizeSurrogates(context.systemPrompt) });
	}

	let lastRole: string | null = null;

	for (let i = 0; i < transformedMessages.length; i++) {
		const msg = transformedMessages[i];
		if (compat.requiresAssistantAfterToolResult && lastRole === "toolResult" && msg.role === "user") {
			params.push({ role: "assistant", content: "I have processed the tool results." });
		}

		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				params.push({ role: "user", content: sanitizeSurrogates(msg.content) });
			} else {
				const content: ChatCompletionContentPart[] = msg.content.map((item): ChatCompletionContentPart => {
					if (item.type === "text") {
						return { type: "text", text: sanitizeSurrogates(item.text) } satisfies ChatCompletionContentPartText;
					} else {
						return {
							type: "image_url",
							image_url: { url: `data:${item.mimeType};base64,${item.data}` },
						} satisfies ChatCompletionContentPartImage;
					}
				});
				const filteredContent = !model.input.includes("image") ? content.filter((c) => c.type !== "image_url") : content;
				if (filteredContent.length === 0) continue;
				params.push({ role: "user", content: filteredContent });
			}
		} else if (msg.role === "assistant") {
			const assistantMsg: ChatCompletionAssistantMessageParam = {
				role: "assistant",
				content: compat.requiresAssistantAfterToolResult ? "" : null,
			};

			const textBlocks = msg.content.filter((b) => b.type === "text") as TextContent[];
			const nonEmptyTextBlocks = textBlocks.filter((b) => b.text && b.text.trim().length > 0);
			if (nonEmptyTextBlocks.length > 0) {
				assistantMsg.content = nonEmptyTextBlocks.map((b) => {
					return { type: "text", text: sanitizeSurrogates(b.text) };
				});
			}

			const thinkingBlocks = msg.content.filter((b) => b.type === "thinking") as ThinkingContent[];
			const nonEmptyThinkingBlocks = thinkingBlocks.filter((b) => b.thinking && b.thinking.trim().length > 0);
			if (nonEmptyThinkingBlocks.length > 0) {
				if (compat.requiresThinkingAsText) {
					const thinkingText = nonEmptyThinkingBlocks.map((b) => b.thinking).join("\n\n");
					const textContent = assistantMsg.content as Array<{ type: "text"; text: string }> | null;
					if (textContent) {
						textContent.unshift({ type: "text", text: thinkingText });
					} else {
						assistantMsg.content = [{ type: "text", text: thinkingText }];
					}
				} else {
					const signature = nonEmptyThinkingBlocks[0].thinkingSignature;
					if (signature && signature.length > 0) {
						(assistantMsg as any)[signature] = nonEmptyThinkingBlocks.map((b) => b.thinking).join("\n");
					}
				}
			}

			const toolCalls = msg.content.filter((b) => b.type === "toolCall") as ToolCall[];
			if (toolCalls.length > 0) {
				assistantMsg.tool_calls = toolCalls.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
				}));
				const reasoningDetails = toolCalls
					.filter((tc) => tc.thoughtSignature)
					.map((tc) => { try { return JSON.parse(tc.thoughtSignature!); } catch { return null; } })
					.filter(Boolean);
				if (reasoningDetails.length > 0) {
					(assistantMsg as any).reasoning_details = reasoningDetails;
				}
			}

			const content = assistantMsg.content;
			const hasContent = content !== null && content !== undefined &&
				(typeof content === "string" ? content.length > 0 : content.length > 0);
			if (!hasContent && !assistantMsg.tool_calls) continue;
			params.push(assistantMsg);
		} else if (msg.role === "toolResult") {
			const imageBlocks: Array<{ type: "image_url"; image_url: { url: string } }> = [];
			let j = i;

			for (; j < transformedMessages.length && transformedMessages[j].role === "toolResult"; j++) {
				const toolMsg = transformedMessages[j] as ToolResultMessage;
				const textResult = toolMsg.content.filter((c) => c.type === "text").map((c) => (c as any).text).join("\n");
				const hasImages = toolMsg.content.some((c) => c.type === "image");
				const hasText = textResult.length > 0;

				const toolResultMsg: ChatCompletionToolMessageParam = {
					role: "tool",
					content: sanitizeSurrogates(hasText ? textResult : "(see attached image)"),
					tool_call_id: toolMsg.toolCallId,
				};
				if (compat.requiresToolResultName && toolMsg.toolName) {
					(toolResultMsg as any).name = toolMsg.toolName;
				}
				params.push(toolResultMsg);

				if (hasImages && model.input.includes("image")) {
					for (const block of toolMsg.content) {
						if (block.type === "image") {
							imageBlocks.push({
								type: "image_url",
								image_url: { url: `data:${(block as any).mimeType};base64,${(block as any).data}` },
							});
						}
					}
				}
			}
			i = j - 1;

			if (imageBlocks.length > 0) {
				if (compat.requiresAssistantAfterToolResult) {
					params.push({ role: "assistant", content: "I have processed the tool results." });
				}
				params.push({
					role: "user",
					content: [{ type: "text", text: "Attached image(s) from tool result:" }, ...imageBlocks],
				});
				lastRole = "user";
			} else {
				lastRole = "toolResult";
			}
			continue;
		}

		lastRole = msg.role;
	}

	return params;
}

function convertTools(
	tools: Tool[],
	compat: Required<OpenAICompletionsCompat>,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters as any,
			...(compat.supportsStrictMode !== false && { strict: false }),
		},
	}));
}

function mapStopReason(reason: ChatCompletionChunk.Choice["finish_reason"]): StopReason {
	if (reason === null) return "stop";
	switch (reason) {
		case "stop": return "stop";
		case "length": return "length";
		case "function_call":
		case "tool_calls": return "toolUse";
		case "content_filter": return "error";
		default: return "error";
	}
}

function detectCompat(model: Model<"openai-completions">): Required<OpenAICompletionsCompat> {
	const provider = model.provider;
	const baseUrl = model.baseUrl;

	const isZai = provider === "zai" || baseUrl.includes("api.z.ai");
	const isNonStandard =
		provider === "cerebras" || baseUrl.includes("cerebras.ai") ||
		provider === "xai" || baseUrl.includes("api.x.ai") ||
		provider === "mistral" || baseUrl.includes("mistral.ai") ||
		baseUrl.includes("chutes.ai") || baseUrl.includes("deepseek.com") ||
		isZai || provider === "opencode" || baseUrl.includes("opencode.ai");

	const useMaxTokens = provider === "mistral" || baseUrl.includes("mistral.ai") || baseUrl.includes("chutes.ai");
	const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
	const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai");

	return {
		supportsStore: !isNonStandard,
		supportsDeveloperRole: !isNonStandard,
		supportsReasoningEffort: !isGrok && !isZai,
		supportsUsageInStreaming: true,
		maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
		requiresToolResultName: isMistral,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: isMistral,
		requiresMistralToolIds: isMistral,
		thinkingFormat: isZai ? "zai" : "openai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		supportsStrictMode: true,
	};
}

function getCompat(model: Model<"openai-completions">): Required<OpenAICompletionsCompat> {
	const detected = detectCompat(model);
	if (!model.compat) return detected;

	return {
		supportsStore: model.compat.supportsStore ?? detected.supportsStore,
		supportsDeveloperRole: model.compat.supportsDeveloperRole ?? detected.supportsDeveloperRole,
		supportsReasoningEffort: model.compat.supportsReasoningEffort ?? detected.supportsReasoningEffort,
		supportsUsageInStreaming: model.compat.supportsUsageInStreaming ?? detected.supportsUsageInStreaming,
		maxTokensField: model.compat.maxTokensField ?? detected.maxTokensField,
		requiresToolResultName: model.compat.requiresToolResultName ?? detected.requiresToolResultName,
		requiresAssistantAfterToolResult: model.compat.requiresAssistantAfterToolResult ?? detected.requiresAssistantAfterToolResult,
		requiresThinkingAsText: model.compat.requiresThinkingAsText ?? detected.requiresThinkingAsText,
		requiresMistralToolIds: model.compat.requiresMistralToolIds ?? detected.requiresMistralToolIds,
		thinkingFormat: model.compat.thinkingFormat ?? detected.thinkingFormat,
		openRouterRouting: model.compat.openRouterRouting ?? {},
		vercelGatewayRouting: model.compat.vercelGatewayRouting ?? detected.vercelGatewayRouting,
		supportsStrictMode: model.compat.supportsStrictMode ?? detected.supportsStrictMode,
	};
}
