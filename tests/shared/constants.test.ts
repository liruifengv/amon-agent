import { describe, it, expect } from "vitest";
import {
	filterBlockedHeaders,
	BLOCKED_CUSTOM_HEADERS,
	STREAM_THROTTLE_MS,
	COMMAND_TIMEOUT_MS,
	AUTO_SAVE_INTERVAL_MS,
	MAX_OUTPUT_TOKENS,
	DEFAULT_MAX_THINKING_TOKENS,
	DATA_DIR,
	SESSIONS_DIR,
	SETTINGS_PATH,
	DEFAULT_WORKSPACE_PATH,
	SCROLL_DELAY_MS,
	LOG_DATA_TRUNCATE_LENGTH,
} from "@/shared/constants";

describe("filterBlockedHeaders", () => {
	it("returns undefined for undefined input", () => {
		expect(filterBlockedHeaders(undefined)).toBeUndefined();
	});

	it("returns undefined for empty object", () => {
		expect(filterBlockedHeaders({})).toBeUndefined();
	});

	it("returns undefined when only blocked headers are present (authorization)", () => {
		expect(filterBlockedHeaders({ authorization: "Bearer token" })).toBeUndefined();
	});

	it("returns undefined when only blocked headers are present (x-api-key)", () => {
		expect(filterBlockedHeaders({ "x-api-key": "sk-123" })).toBeUndefined();
	});

	it("returns undefined when both blocked headers are present", () => {
		expect(
			filterBlockedHeaders({
				authorization: "Bearer token",
				"x-api-key": "sk-123",
			}),
		).toBeUndefined();
	});

	it("filters out blocked headers with mixed case (Authorization)", () => {
		expect(filterBlockedHeaders({ Authorization: "Bearer token" })).toBeUndefined();
	});

	it("filters out blocked headers with upper case (X-API-KEY)", () => {
		expect(filterBlockedHeaders({ "X-API-KEY": "sk-123" })).toBeUndefined();
	});

	it("preserves non-blocked headers", () => {
		const result = filterBlockedHeaders({
			"content-type": "application/json",
			"x-custom": "value",
		});
		expect(result).toEqual({
			"content-type": "application/json",
			"x-custom": "value",
		});
	});

	it("returns only non-blocked headers from a mixed set", () => {
		const result = filterBlockedHeaders({
			authorization: "Bearer token",
			"content-type": "application/json",
			"x-api-key": "sk-123",
			"x-request-id": "abc",
		});
		expect(result).toEqual({
			"content-type": "application/json",
			"x-request-id": "abc",
		});
	});
});

describe("constant values", () => {
	it("BLOCKED_CUSTOM_HEADERS contains the expected entries", () => {
		expect(BLOCKED_CUSTOM_HEADERS).toEqual(["authorization", "x-api-key"]);
	});

	it("STREAM_THROTTLE_MS is 50", () => {
		expect(STREAM_THROTTLE_MS).toBe(50);
	});

	it("AUTO_SAVE_INTERVAL_MS is 3000", () => {
		expect(AUTO_SAVE_INTERVAL_MS).toBe(3000);
	});

	it("COMMAND_TIMEOUT_MS is 120000", () => {
		expect(COMMAND_TIMEOUT_MS).toBe(120000);
	});

	it("MAX_OUTPUT_TOKENS is 16384", () => {
		expect(MAX_OUTPUT_TOKENS).toBe(16384);
	});

	it("DEFAULT_MAX_THINKING_TOKENS is 10000", () => {
		expect(DEFAULT_MAX_THINKING_TOKENS).toBe(10000);
	});

	it("DATA_DIR points to ~/.amon", () => {
		expect(DATA_DIR).toBe("~/.amon");
	});

	it("SESSIONS_DIR points to ~/.amon/sessions", () => {
		expect(SESSIONS_DIR).toBe("~/.amon/sessions");
	});

	it("SETTINGS_PATH points to ~/.amon/settings.json", () => {
		expect(SETTINGS_PATH).toBe("~/.amon/settings.json");
	});

	it("DEFAULT_WORKSPACE_PATH points to ~/.amon/workspace", () => {
		expect(DEFAULT_WORKSPACE_PATH).toBe("~/.amon/workspace");
	});

	it("SCROLL_DELAY_MS is 100", () => {
		expect(SCROLL_DELAY_MS).toBe(100);
	});

	it("LOG_DATA_TRUNCATE_LENGTH is 1000", () => {
		expect(LOG_DATA_TRUNCATE_LENGTH).toBe(1000);
	});
});
