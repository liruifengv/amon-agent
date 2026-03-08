import { describe, it, expect } from "vitest";
import { getModel, getProviders, getModels, calculateCost, supportsXhigh, modelsAreEqual } from "@/ai/models";
import { createMockModel, createAnthropicModel, createOpenAIModel } from "../_helpers/mock-models";
import { createUsage } from "../_helpers/mock-messages";

describe("getModel", () => {
	it("returns a defined model for a known provider and model ID", () => {
		const model = getModel("anthropic", "claude-opus-4-6");
		expect(model).toBeDefined();
		expect(model.id).toBe("claude-opus-4-6");
		expect(model.provider).toBe("anthropic");
	});

	it("returns a defined model for openai provider", () => {
		const model = getModel("openai", "gpt-4o");
		expect(model).toBeDefined();
		expect(model.id).toBe("gpt-4o");
		expect(model.provider).toBe("openai");
	});

	it("returns a defined model for google provider", () => {
		const model = getModel("google", "gemini-2.5-flash");
		expect(model).toBeDefined();
		expect(model.id).toBe("gemini-2.5-flash");
	});

	it("returns undefined for an unknown model ID", () => {
		const model = getModel("anthropic", "nonexistent-model" as any);
		expect(model).toBeUndefined();
	});
});

describe("getProviders", () => {
	it("returns a non-empty array", () => {
		const providers = getProviders();
		expect(providers.length).toBeGreaterThan(0);
	});

	it("includes known providers", () => {
		const providers = getProviders();
		expect(providers).toContain("anthropic");
		expect(providers).toContain("openai");
		expect(providers).toContain("google");
	});
});

describe("getModels", () => {
	it("returns models for a known provider", () => {
		const models = getModels("anthropic");
		expect(models.length).toBeGreaterThan(0);
		for (const m of models) {
			expect(m.provider).toBe("anthropic");
		}
	});

	it("returns models for openai provider", () => {
		const models = getModels("openai");
		expect(models.length).toBeGreaterThan(0);
	});

	it("returns an empty array for an unknown provider", () => {
		const models = getModels("nonexistent" as any);
		expect(models).toEqual([]);
	});
});

describe("calculateCost", () => {
	it("computes cost fields correctly and mutates the usage object", () => {
		const model = createMockModel({
			cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		});
		const usage = createUsage({
			input: 1000,
			output: 500,
			cacheRead: 200,
			cacheWrite: 100,
		});

		const cost = calculateCost(model, usage);

		expect(cost.input).toBeCloseTo((3 / 1_000_000) * 1000);
		expect(cost.output).toBeCloseTo((15 / 1_000_000) * 500);
		expect(cost.cacheRead).toBeCloseTo((0.3 / 1_000_000) * 200);
		expect(cost.cacheWrite).toBeCloseTo((3.75 / 1_000_000) * 100);
		expect(cost.total).toBeCloseTo(cost.input + cost.output + cost.cacheRead + cost.cacheWrite);

		// Verify mutation
		expect(usage.cost).toBe(cost);
		expect(usage.cost.total).toBe(cost.total);
	});

	it("handles zero usage values", () => {
		const model = createMockModel({
			cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		});
		const usage = createUsage({
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		});

		const cost = calculateCost(model, usage);
		expect(cost.input).toBe(0);
		expect(cost.output).toBe(0);
		expect(cost.cacheRead).toBe(0);
		expect(cost.cacheWrite).toBe(0);
		expect(cost.total).toBe(0);
	});
});

describe("supportsXhigh", () => {
	it("returns true for anthropic model with opus-4-6 in ID", () => {
		const model = createAnthropicModel({ id: "claude-opus-4-6" });
		expect(supportsXhigh(model)).toBe(true);
	});

	it("returns true for anthropic model with opus-4.6 in ID", () => {
		const model = createAnthropicModel({ id: "claude-opus-4.6-preview" });
		expect(supportsXhigh(model)).toBe(true);
	});

	it("returns true for openai model with gpt-5 in ID", () => {
		const model = createOpenAIModel({
			id: "gpt-5",
			api: "openai-responses" as any,
		});
		expect(supportsXhigh(model)).toBe(true);
	});

	it("returns true for openai-completions model with gpt-5 in ID", () => {
		const model = createOpenAIModel({
			id: "gpt-5-turbo",
			api: "openai-completions",
		});
		expect(supportsXhigh(model)).toBe(true);
	});

	it("returns false for anthropic model without opus-4-6/4.6", () => {
		const model = createAnthropicModel({ id: "claude-sonnet-4-5-20250929" });
		expect(supportsXhigh(model)).toBe(false);
	});

	it("returns false for openai model without gpt-5", () => {
		const model = createOpenAIModel({ id: "gpt-4o" });
		expect(supportsXhigh(model)).toBe(false);
	});

	it("returns false for google model regardless of ID", () => {
		const model = createMockModel({
			id: "gemini-opus-4-6",
			api: "google-generative-ai",
			provider: "google",
		});
		expect(supportsXhigh(model)).toBe(false);
	});
});

describe("modelsAreEqual", () => {
	it("returns false when first model is null", () => {
		const model = createMockModel();
		expect(modelsAreEqual(null, model)).toBe(false);
	});

	it("returns false when second model is null", () => {
		const model = createMockModel();
		expect(modelsAreEqual(model, null)).toBe(false);
	});

	it("returns false when both models are null", () => {
		expect(modelsAreEqual(null, null)).toBe(false);
	});

	it("returns false when first model is undefined", () => {
		const model = createMockModel();
		expect(modelsAreEqual(undefined, model)).toBe(false);
	});

	it("returns true for models with same id and provider", () => {
		const a = createMockModel({ id: "test-1", provider: "anthropic" });
		const b = createMockModel({ id: "test-1", provider: "anthropic" });
		expect(modelsAreEqual(a, b)).toBe(true);
	});

	it("returns false for models with different id", () => {
		const a = createMockModel({ id: "test-1", provider: "anthropic" });
		const b = createMockModel({ id: "test-2", provider: "anthropic" });
		expect(modelsAreEqual(a, b)).toBe(false);
	});

	it("returns false for models with different provider", () => {
		const a = createMockModel({ id: "test-1", provider: "anthropic" });
		const b = createMockModel({ id: "test-1", provider: "openai" });
		expect(modelsAreEqual(a, b)).toBe(false);
	});

	it("returns false for models with different id and provider", () => {
		const a = createAnthropicModel({ id: "claude-opus-4-6" });
		const b = createOpenAIModel({ id: "gpt-4o" });
		expect(modelsAreEqual(a, b)).toBe(false);
	});
});
