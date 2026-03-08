import { describe, it, expect } from "vitest";
import { transformMessages } from "@/ai/providers/transform-messages";
import { createMockModel } from "../../_helpers/mock-models";
import {
	createAssistantMessage,
	createUserMessage,
	createToolCallContent,
	createThinkingContent,
	createToolResultMessage,
} from "../../_helpers/mock-messages";

describe("transformMessages", () => {
	const sameModel = createMockModel({
		id: "test-model",
		api: "anthropic-messages",
		provider: "anthropic",
	});

	const differentModel = createMockModel({
		id: "other-model",
		api: "openai-completions" as any,
		provider: "openai",
	});

	describe("user messages", () => {
		it("passes user messages through unchanged", () => {
			const user = createUserMessage("hello");
			const result = transformMessages([user], sameModel);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(user);
		});
	});

	describe("same model assistant messages", () => {
		it("preserves thinking blocks with thinkingSignature (even if thinking is empty)", () => {
			const assistant = createAssistantMessage(
				[createThinkingContent("", { thinkingSignature: "sig123" })],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], sameModel);
			expect(result).toHaveLength(1);
			const msg = result[0] as typeof assistant;
			expect(msg.content).toHaveLength(1);
			expect(msg.content[0]).toEqual(
				expect.objectContaining({ type: "thinking", thinkingSignature: "sig123" }),
			);
		});

		it("drops empty thinking blocks without signature", () => {
			const assistant = createAssistantMessage(
				[
					createThinkingContent(""),
					{ type: "text", text: "hello" },
				],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], sameModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content).toHaveLength(1);
			expect(msg.content[0]).toEqual({ type: "text", text: "hello" });
		});

		it("keeps thinking blocks with content and no signature as thinking", () => {
			const assistant = createAssistantMessage(
				[createThinkingContent("I need to think about this")],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], sameModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content).toHaveLength(1);
			expect(msg.content[0]).toEqual(
				expect.objectContaining({ type: "thinking", thinking: "I need to think about this" }),
			);
		});

		it("preserves text blocks as-is (including textSignature)", () => {
			const assistant = createAssistantMessage(
				[{ type: "text", text: "response", textSignature: "tsig" }],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], sameModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content[0]).toEqual({ type: "text", text: "response", textSignature: "tsig" });
		});

		it("preserves tool calls as-is (thoughtSignature kept)", () => {
			const tc = createToolCallContent({ thoughtSignature: "thought_sig" });
			const assistant = createAssistantMessage(
				[tc],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], sameModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content[0]).toEqual(expect.objectContaining({ thoughtSignature: "thought_sig" }));
		});
	});

	describe("different model assistant messages", () => {
		it("converts thinking blocks with content to text blocks", () => {
			const assistant = createAssistantMessage(
				[createThinkingContent("deep thoughts")],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], differentModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content).toHaveLength(1);
			expect(msg.content[0]).toEqual({ type: "text", text: "deep thoughts" });
		});

		it("drops empty thinking blocks", () => {
			const assistant = createAssistantMessage(
				[
					createThinkingContent(""),
					{ type: "text", text: "result" },
				],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], differentModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content).toHaveLength(1);
			expect(msg.content[0]).toEqual({ type: "text", text: "result" });
		});

		it("strips textSignature from text blocks", () => {
			const assistant = createAssistantMessage(
				[{ type: "text", text: "response", textSignature: "should_be_removed" }],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], differentModel);
			const msg = result[0] as typeof assistant;
			expect(msg.content[0]).toEqual({ type: "text", text: "response" });
			expect((msg.content[0] as any).textSignature).toBeUndefined();
		});

		it("removes thoughtSignature from tool calls", () => {
			const tc = createToolCallContent({
				id: "tc_001",
				thoughtSignature: "thought_sig",
			});
			const assistant = createAssistantMessage(
				[tc],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const result = transformMessages([assistant], differentModel);
			const msg = result[0] as typeof assistant;
			expect((msg.content[0] as any).thoughtSignature).toBeUndefined();
		});

		it("applies normalizeToolCallId to tool calls and corresponding tool results", () => {
			const tc = createToolCallContent({ id: "original_id_123" });
			const assistant = createAssistantMessage(
				[tc],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);
			const toolResult = createToolResultMessage("original_id_123", "result");

			const normalizer = (_id: string) => "normalized_id";
			const result = transformMessages([assistant, toolResult], differentModel, normalizer);

			const assistantOut = result[0] as typeof assistant;
			expect((assistantOut.content[0] as any).id).toBe("normalized_id");

			const toolResultOut = result[1] as typeof toolResult;
			expect(toolResultOut.toolCallId).toBe("normalized_id");
		});
	});

	describe("second pass: orphaned tool calls and error handling", () => {
		it("inserts synthetic results for orphaned tool calls (no matching toolResult)", () => {
			const tc = createToolCallContent({ id: "orphan_tc" });
			const assistant = createAssistantMessage(
				[tc],
				{
					provider: "anthropic",
					api: "anthropic-messages",
					model: "test-model",
					stopReason: "toolUse",
				},
			);
			// Next message is another assistant, so the tool call from the first is orphaned
			const assistant2 = createAssistantMessage(
				[{ type: "text", text: "continuing" }],
				{ provider: "anthropic", api: "anthropic-messages", model: "test-model" },
			);

			const result = transformMessages([assistant, assistant2], sameModel);

			// Should be: assistant1, synthetic toolResult, assistant2
			expect(result).toHaveLength(3);
			expect(result[0].role).toBe("assistant");
			expect(result[1].role).toBe("toolResult");
			const synth = result[1] as ReturnType<typeof createToolResultMessage>;
			expect(synth.toolCallId).toBe("orphan_tc");
			expect(synth.isError).toBe(true);
			expect(synth.content[0]).toEqual(expect.objectContaining({ text: "No result provided" }));
			expect(result[2].role).toBe("assistant");
		});

		it("skips assistant messages with stopReason 'error'", () => {
			const errorMsg = createAssistantMessage(
				[{ type: "text", text: "error occurred" }],
				{
					provider: "anthropic",
					api: "anthropic-messages",
					model: "test-model",
					stopReason: "error",
				},
			);
			const user = createUserMessage("retry");

			const result = transformMessages([errorMsg, user], sameModel);

			// error assistant should be dropped
			expect(result).toHaveLength(1);
			expect(result[0].role).toBe("user");
		});

		it("skips assistant messages with stopReason 'aborted'", () => {
			const abortedMsg = createAssistantMessage(
				[{ type: "text", text: "aborted" }],
				{
					provider: "anthropic",
					api: "anthropic-messages",
					model: "test-model",
					stopReason: "aborted",
				},
			);

			const result = transformMessages([abortedMsg], sameModel);
			expect(result).toHaveLength(0);
		});

		it("inserts synthetic results when user message interrupts tool flow", () => {
			const tc = createToolCallContent({ id: "interrupted_tc" });
			const assistant = createAssistantMessage(
				[tc],
				{
					provider: "anthropic",
					api: "anthropic-messages",
					model: "test-model",
					stopReason: "toolUse",
				},
			);
			const user = createUserMessage("interrupt!");

			const result = transformMessages([assistant, user], sameModel);

			// Should be: assistant, synthetic toolResult, user
			expect(result).toHaveLength(3);
			expect(result[0].role).toBe("assistant");
			expect(result[1].role).toBe("toolResult");
			const synth = result[1] as ReturnType<typeof createToolResultMessage>;
			expect(synth.toolCallId).toBe("interrupted_tc");
			expect(synth.isError).toBe(true);
			expect(result[2].role).toBe("user");
		});

		it("does not insert synthetic results when toolResult exists", () => {
			const tc = createToolCallContent({ id: "matched_tc" });
			const assistant = createAssistantMessage(
				[tc],
				{
					provider: "anthropic",
					api: "anthropic-messages",
					model: "test-model",
					stopReason: "toolUse",
				},
			);
			const toolResult = createToolResultMessage("matched_tc", "done");

			const result = transformMessages([assistant, toolResult], sameModel);

			expect(result).toHaveLength(2);
			expect(result[0].role).toBe("assistant");
			expect(result[1].role).toBe("toolResult");
		});
	});
});
