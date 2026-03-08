import { describe, it, expect } from "vitest";
import { parseStreamingJson } from "@/ai/utils/json-parse";

describe("parseStreamingJson", () => {
	it("returns empty object for undefined input", () => {
		expect(parseStreamingJson(undefined)).toEqual({});
	});

	it("returns empty object for empty string", () => {
		expect(parseStreamingJson("")).toEqual({});
	});

	it("returns empty object for whitespace-only string", () => {
		expect(parseStreamingJson("   ")).toEqual({});
		expect(parseStreamingJson("\t\n")).toEqual({});
	});

	it("parses a complete JSON object correctly", () => {
		const json = '{"name": "test", "value": 42}';
		expect(parseStreamingJson(json)).toEqual({ name: "test", value: 42 });
	});

	it("parses a complete JSON array correctly", () => {
		const json = '[1, 2, 3]';
		expect(parseStreamingJson(json)).toEqual([1, 2, 3]);
	});

	it("parses nested JSON correctly", () => {
		const json = '{"a": {"b": [1, 2]}, "c": true}';
		expect(parseStreamingJson(json)).toEqual({ a: { b: [1, 2] }, c: true });
	});

	it("parses truncated JSON object via partial-json fallback", () => {
		const truncated = '{"key": "val';
		const result = parseStreamingJson(truncated);
		expect(result).toHaveProperty("key");
		expect((result as Record<string, string>).key).toBe("val");
	});

	it("parses truncated JSON with missing closing brace", () => {
		const truncated = '{"a": 1, "b": 2';
		const result = parseStreamingJson<Record<string, number>>(truncated);
		expect(result.a).toBe(1);
		expect(result.b).toBe(2);
	});

	it("returns empty object for totally invalid JSON", () => {
		expect(parseStreamingJson("not json at all")).toEqual({});
	});

	it("returns empty object for random symbols", () => {
		expect(parseStreamingJson("}{][")).toEqual({});
	});
});
