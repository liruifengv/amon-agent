import { describe, it, expect } from "vitest";
import { PROVIDER_PRESETS } from "@/shared/provider-presets";
import type { KnownApi } from "@/ai/types";

const VALID_API_TYPES: KnownApi[] = [
	"anthropic-messages",
	"openai-completions",
	"openai-responses",
	"google-generative-ai",
];

describe("PROVIDER_PRESETS", () => {
	it("is a non-empty array", () => {
		expect(Array.isArray(PROVIDER_PRESETS)).toBe(true);
		expect(PROVIDER_PRESETS.length).toBeGreaterThan(0);
	});

	it("contains exactly 9 presets", () => {
		expect(PROVIDER_PRESETS).toHaveLength(9);
	});

	it.each(PROVIDER_PRESETS.map((p) => [p.id, p]))(
		"preset '%s' has all required fields",
		(_id, preset) => {
			expect(typeof preset.id).toBe("string");
			expect(preset.id.length).toBeGreaterThan(0);
			expect(typeof preset.name).toBe("string");
			expect(preset.name.length).toBeGreaterThan(0);
			expect(typeof preset.apiType).toBe("string");
			expect(preset.apiType.length).toBeGreaterThan(0);
			expect(typeof preset.provider).toBe("string");
			expect(preset.provider.length).toBeGreaterThan(0);
			expect(typeof preset.icon).toBe("string");
			expect(preset.icon.length).toBeGreaterThan(0);
			expect(Array.isArray(preset.defaultModels)).toBe(true);
		},
	);

	it("has unique IDs across all presets", () => {
		const ids = PROVIDER_PRESETS.map((p) => p.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("each preset has at least one default model", () => {
		for (const preset of PROVIDER_PRESETS) {
			expect(preset.defaultModels.length).toBeGreaterThan(0);
		}
	});

	it("contains the claude preset", () => {
		const claude = PROVIDER_PRESETS.find((p) => p.id === "claude");
		expect(claude).toBeDefined();
		expect(claude!.apiType).toBe("anthropic-messages");
		expect(claude!.provider).toBe("anthropic");
	});

	it("contains the openai preset", () => {
		const openai = PROVIDER_PRESETS.find((p) => p.id === "openai");
		expect(openai).toBeDefined();
		expect(openai!.apiType).toBe("openai-completions");
		expect(openai!.provider).toBe("openai");
	});

	it("contains the gemini preset", () => {
		const gemini = PROVIDER_PRESETS.find((p) => p.id === "gemini");
		expect(gemini).toBeDefined();
		expect(gemini!.apiType).toBe("google-generative-ai");
		expect(gemini!.provider).toBe("google");
	});

	it("contains the kimi preset", () => {
		const kimi = PROVIDER_PRESETS.find((p) => p.id === "kimi");
		expect(kimi).toBeDefined();
		expect(kimi!.provider).toBe("kimi-coding");
	});

	it("all apiType values are valid KnownApi strings", () => {
		for (const preset of PROVIDER_PRESETS) {
			expect(VALID_API_TYPES).toContain(preset.apiType);
		}
	});

	it("presets with defaultBaseUrl have valid URLs", () => {
		const presetsWithUrl = PROVIDER_PRESETS.filter((p) => p.defaultBaseUrl);
		expect(presetsWithUrl.length).toBeGreaterThan(0);
		for (const preset of presetsWithUrl) {
			expect(preset.defaultBaseUrl).toMatch(/^https?:\/\//);
		}
	});
});
