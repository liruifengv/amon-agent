import { describe, it, expect } from "vitest";
import { isContextOverflow, getOverflowPatterns } from "@/ai/utils/overflow";
import { createAssistantMessage, createUsage } from "../../_helpers/mock-messages";

describe("isContextOverflow", () => {
	describe("error-based overflow patterns", () => {
		it("detects Anthropic: prompt is too long", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "Error: prompt is too long: 250000 tokens > 200000 maximum",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects Amazon Bedrock: input is too long for requested model", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "The input is too long for requested model.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects OpenAI: exceeds the context window", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "This model's maximum context length is 128000 tokens. Your input exceeds the context window.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects Google Gemini: input token count exceeds the maximum", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "The input token count of 150000 exceeds the maximum allowed 128000.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects Groq: reduce the length of the messages", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "Please reduce the length of the messages.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects OpenRouter: maximum context length is N tokens", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "This model has a maximum context length is 65536 tokens.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects generic: too many tokens", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "Too many tokens in the request.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects generic: token limit exceeded", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "Token limit exceeded.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects generic: context_length_exceeded", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "context_length_exceeded",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects context length exceeded with space separator", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "context length exceeded",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects MiniMax: context window exceeds limit", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "The context window exceeds limit.",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects Kimi: exceeded model token limit", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "exceeded model token limit",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});
	});

	describe("Cerebras/Mistral 400/413 no body pattern", () => {
		it("detects 400 (no body)", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "400 (no body)",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects 413 (no body)", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "413 (no body)",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("detects 400 status code (no body)", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "400 status code (no body)",
			});
			expect(isContextOverflow(msg)).toBe(true);
		});

		it("does not match 404 (no body)", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "404 (no body)",
			});
			expect(isContextOverflow(msg)).toBe(false);
		});
	});

	describe("silent overflow detection", () => {
		it("detects when input + cacheRead exceeds contextWindow", () => {
			const msg = createAssistantMessage([], {
				stopReason: "stop",
				usage: createUsage({
					input: 150000,
					cacheRead: 60000,
				}),
			});
			expect(isContextOverflow(msg, 200000)).toBe(true);
		});

		it("does not flag when input + cacheRead is within contextWindow", () => {
			const msg = createAssistantMessage([], {
				stopReason: "stop",
				usage: createUsage({
					input: 100000,
					cacheRead: 50000,
				}),
			});
			expect(isContextOverflow(msg, 200000)).toBe(false);
		});

		it("does not check silent overflow when no contextWindow is provided", () => {
			const msg = createAssistantMessage([], {
				stopReason: "stop",
				usage: createUsage({
					input: 999999,
					cacheRead: 999999,
				}),
			});
			expect(isContextOverflow(msg)).toBe(false);
		});
	});

	describe("non-overflow cases", () => {
		it("returns false for non-error stopReason", () => {
			const msg = createAssistantMessage([], {
				stopReason: "stop",
			});
			expect(isContextOverflow(msg)).toBe(false);
		});

		it("returns false for toolUse stopReason", () => {
			const msg = createAssistantMessage([], {
				stopReason: "toolUse",
			});
			expect(isContextOverflow(msg)).toBe(false);
		});

		it("returns false for error with non-matching message", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
				errorMessage: "Internal server error: something went wrong",
			});
			expect(isContextOverflow(msg)).toBe(false);
		});

		it("returns false for error with no errorMessage", () => {
			const msg = createAssistantMessage([], {
				stopReason: "error",
			});
			expect(isContextOverflow(msg)).toBe(false);
		});
	});
});

describe("getOverflowPatterns", () => {
	it("returns a non-empty array of RegExp patterns", () => {
		const patterns = getOverflowPatterns();
		expect(patterns.length).toBeGreaterThan(0);
		for (const p of patterns) {
			expect(p).toBeInstanceOf(RegExp);
		}
	});

	it("returns a copy, not a reference to the internal array", () => {
		const a = getOverflowPatterns();
		const b = getOverflowPatterns();
		expect(a).not.toBe(b);
		expect(a).toEqual(b);
	});

	it("contains the expected number of patterns", () => {
		const patterns = getOverflowPatterns();
		expect(patterns).toHaveLength(15);
	});
});
