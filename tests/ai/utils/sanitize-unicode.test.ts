import { describe, it, expect } from "vitest";
import { sanitizeSurrogates } from "@/ai/utils/sanitize-unicode";

describe("sanitizeSurrogates", () => {
	it("leaves plain ASCII text unchanged", () => {
		expect(sanitizeSurrogates("Hello, world!")).toBe("Hello, world!");
	});

	it("preserves valid emoji (properly paired surrogates)", () => {
		const text = "Hello 🙈 World";
		expect(sanitizeSurrogates(text)).toBe("Hello 🙈 World");
	});

	it("preserves multiple valid emoji", () => {
		const text = "🎉🚀✨";
		expect(sanitizeSurrogates(text)).toBe("🎉🚀✨");
	});

	it("removes an unpaired high surrogate", () => {
		const unpaired = String.fromCharCode(0xd83d);
		const text = `Text ${unpaired} here`;
		expect(sanitizeSurrogates(text)).toBe("Text  here");
	});

	it("removes an unpaired low surrogate", () => {
		const unpaired = String.fromCharCode(0xdc00);
		const text = `Text ${unpaired} here`;
		expect(sanitizeSurrogates(text)).toBe("Text  here");
	});

	it("handles mixed valid emoji and unpaired surrogates", () => {
		const unpairedHigh = String.fromCharCode(0xd83d);
		const unpairedLow = String.fromCharCode(0xdc00);
		const text = `Hello 🙈${unpairedHigh} World${unpairedLow}!`;
		expect(sanitizeSurrogates(text)).toBe("Hello 🙈 World!");
	});

	it("returns empty string for empty string input", () => {
		expect(sanitizeSurrogates("")).toBe("");
	});

	it("removes multiple consecutive unpaired surrogates", () => {
		const h1 = String.fromCharCode(0xd800);
		const h2 = String.fromCharCode(0xdbff);
		const text = `a${h1}${h2}b`;
		expect(sanitizeSurrogates(text)).toBe("ab");
	});
});
