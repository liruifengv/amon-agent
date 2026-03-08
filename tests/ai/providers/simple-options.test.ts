import { describe, it, expect } from "vitest";
import { buildBaseOptions, clampReasoning, adjustMaxTokensForThinking } from "@/ai/providers/simple-options";
import { createMockModel } from "../../_helpers/mock-models";

describe("buildBaseOptions", () => {
	it("defaults maxTokens to Math.min(model.maxTokens, 32000)", () => {
		const model = createMockModel({ maxTokens: 64000 });
		const opts = buildBaseOptions(model);
		expect(opts.maxTokens).toBe(32000);
	});

	it("uses model.maxTokens when it is less than 32000", () => {
		const model = createMockModel({ maxTokens: 8192 });
		const opts = buildBaseOptions(model);
		expect(opts.maxTokens).toBe(8192);
	});

	it("uses explicit maxTokens from options when provided", () => {
		const model = createMockModel({ maxTokens: 64000 });
		const opts = buildBaseOptions(model, { maxTokens: 16000 });
		expect(opts.maxTokens).toBe(16000);
	});

	it("prefers explicit apiKey parameter over options.apiKey", () => {
		const model = createMockModel();
		const opts = buildBaseOptions(model, { apiKey: "options-key" }, "explicit-key");
		expect(opts.apiKey).toBe("explicit-key");
	});

	it("falls back to options.apiKey when explicit apiKey is not provided", () => {
		const model = createMockModel();
		const opts = buildBaseOptions(model, { apiKey: "options-key" });
		expect(opts.apiKey).toBe("options-key");
	});

	it("sets apiKey to undefined when neither is provided", () => {
		const model = createMockModel();
		const opts = buildBaseOptions(model);
		expect(opts.apiKey).toBeUndefined();
	});

	it("passes through temperature from options", () => {
		const model = createMockModel();
		const opts = buildBaseOptions(model, { temperature: 0.7 });
		expect(opts.temperature).toBe(0.7);
	});

	it("passes through headers from options", () => {
		const model = createMockModel();
		const headers = { "x-custom": "value" };
		const opts = buildBaseOptions(model, { headers });
		expect(opts.headers).toEqual(headers);
	});
});

describe("clampReasoning", () => {
	it("clamps xhigh to high", () => {
		expect(clampReasoning("xhigh")).toBe("high");
	});

	it("passes through minimal", () => {
		expect(clampReasoning("minimal")).toBe("minimal");
	});

	it("passes through low", () => {
		expect(clampReasoning("low")).toBe("low");
	});

	it("passes through medium", () => {
		expect(clampReasoning("medium")).toBe("medium");
	});

	it("passes through high", () => {
		expect(clampReasoning("high")).toBe("high");
	});

	it("returns undefined for undefined input", () => {
		expect(clampReasoning(undefined)).toBeUndefined();
	});
});

describe("adjustMaxTokensForThinking", () => {
	const modelMax = 64000;

	it("uses default budget for minimal level (1024)", () => {
		const result = adjustMaxTokensForThinking(32000, modelMax, "minimal");
		expect(result.thinkingBudget).toBe(1024);
		expect(result.maxTokens).toBe(32000 + 1024);
	});

	it("uses default budget for low level (2048)", () => {
		const result = adjustMaxTokensForThinking(32000, modelMax, "low");
		expect(result.thinkingBudget).toBe(2048);
		expect(result.maxTokens).toBe(32000 + 2048);
	});

	it("uses default budget for medium level (8192)", () => {
		const result = adjustMaxTokensForThinking(32000, modelMax, "medium");
		expect(result.thinkingBudget).toBe(8192);
		expect(result.maxTokens).toBe(32000 + 8192);
	});

	it("uses default budget for high level (16384)", () => {
		const result = adjustMaxTokensForThinking(32000, modelMax, "high");
		expect(result.thinkingBudget).toBe(16384);
		expect(result.maxTokens).toBe(32000 + 16384);
	});

	it("clamps xhigh to high level budget", () => {
		const result = adjustMaxTokensForThinking(32000, modelMax, "xhigh");
		expect(result.thinkingBudget).toBe(16384);
		expect(result.maxTokens).toBe(32000 + 16384);
	});

	it("caps maxTokens at modelMaxTokens", () => {
		const result = adjustMaxTokensForThinking(60000, modelMax, "high");
		// 60000 + 16384 = 76384, capped to 64000
		expect(result.maxTokens).toBe(modelMax);
	});

	it("clamps thinkingBudget when maxTokens <= thinkingBudget", () => {
		// Very small model: maxTokens will be min(baseMax + budget, modelMax)
		// With modelMax=2000, high budget=16384: maxTokens = min(1000+16384, 2000) = 2000
		// 2000 <= 16384, so thinkingBudget = max(0, 2000-1024) = 976
		const result = adjustMaxTokensForThinking(1000, 2000, "high");
		expect(result.maxTokens).toBe(2000);
		expect(result.thinkingBudget).toBe(2000 - 1024);
	});

	it("clamps thinkingBudget to 0 when maxTokens is extremely low", () => {
		// modelMax=500, high budget=16384: maxTokens = min(100+16384, 500) = 500
		// 500 <= 16384, so thinkingBudget = max(0, 500-1024) = 0
		const result = adjustMaxTokensForThinking(100, 500, "high");
		expect(result.maxTokens).toBe(500);
		expect(result.thinkingBudget).toBe(0);
	});

	it("uses custom budgets when provided", () => {
		const customBudgets = { low: 4096, medium: 12000 };
		const resultLow = adjustMaxTokensForThinking(32000, modelMax, "low", customBudgets);
		expect(resultLow.thinkingBudget).toBe(4096);
		expect(resultLow.maxTokens).toBe(32000 + 4096);

		const resultMedium = adjustMaxTokensForThinking(32000, modelMax, "medium", customBudgets);
		expect(resultMedium.thinkingBudget).toBe(12000);
		expect(resultMedium.maxTokens).toBe(32000 + 12000);
	});

	it("custom budgets merge with defaults (unset levels use defaults)", () => {
		const customBudgets = { low: 5000 };
		// high should still use the default of 16384
		const result = adjustMaxTokensForThinking(32000, modelMax, "high", customBudgets);
		expect(result.thinkingBudget).toBe(16384);
	});
});
