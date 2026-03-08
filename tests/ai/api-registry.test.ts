import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	registerApiProvider,
	getApiProvider,
	getApiProviders,
	unregisterApiProviders,
	clearApiProviders,
} from "@/ai/api-registry";
import { createAssistantMessageEventStream } from "@/ai/utils/event-stream";
import { createMockModel } from "../_helpers/mock-models";
import type { Api, AssistantMessageEventStream as AssistantMessageEventStreamType } from "@/ai/types";

// Helper to create a minimal mock provider for registration
function createMockProvider(api: string) {
	return {
		api,
		stream: vi.fn(() => createAssistantMessageEventStream()),
		streamSimple: vi.fn(() => createAssistantMessageEventStream()),
	};
}

describe("api-registry", () => {
	beforeEach(() => {
		clearApiProviders();
	});

	// ---------------------------------------------------------------------------
	// registerApiProvider / getApiProvider
	// ---------------------------------------------------------------------------

	describe("registerApiProvider & getApiProvider", () => {
		it("registers a provider and retrieves it by api", () => {
			const provider = createMockProvider("test-api");
			registerApiProvider(provider);

			const retrieved = getApiProvider("test-api");
			expect(retrieved).toBeDefined();
			expect(retrieved!.api).toBe("test-api");
		});

		it("returns undefined for an unregistered api", () => {
			const result = getApiProvider("nonexistent-api");
			expect(result).toBeUndefined();
		});

		it("replaces existing provider when registering same api", () => {
			const provider1 = createMockProvider("same-api");
			const provider2 = createMockProvider("same-api");

			registerApiProvider(provider1);
			registerApiProvider(provider2);

			// Should have only 1 provider for this api
			const providers = getApiProviders();
			const matchingProviders = providers.filter((p) => p.api === "same-api");
			expect(matchingProviders).toHaveLength(1);

			// The stream functions should be wrapped around provider2's functions.
			// Call stream to verify it invokes the latest provider's stream.
			const model = createMockModel({ api: "same-api" as Api });
			const retrieved = getApiProvider("same-api")!;
			retrieved.stream(model, { messages: [] });

			// provider2.stream should have been called (via the wrapper)
			expect(provider2.stream).toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// getApiProviders
	// ---------------------------------------------------------------------------

	describe("getApiProviders", () => {
		it("returns all registered providers", () => {
			registerApiProvider(createMockProvider("api-a"));
			registerApiProvider(createMockProvider("api-b"));
			registerApiProvider(createMockProvider("api-c"));

			const providers = getApiProviders();
			expect(providers).toHaveLength(3);

			const apis = providers.map((p) => p.api).sort();
			expect(apis).toEqual(["api-a", "api-b", "api-c"]);
		});

		it("returns empty array when nothing is registered", () => {
			expect(getApiProviders()).toEqual([]);
		});
	});

	// ---------------------------------------------------------------------------
	// unregisterApiProviders
	// ---------------------------------------------------------------------------

	describe("unregisterApiProviders", () => {
		it("removes providers by sourceId", () => {
			registerApiProvider(createMockProvider("plugin-api-1"), "my-plugin");
			registerApiProvider(createMockProvider("plugin-api-2"), "my-plugin");
			registerApiProvider(createMockProvider("core-api"), "core");

			expect(getApiProviders()).toHaveLength(3);

			unregisterApiProviders("my-plugin");

			const remaining = getApiProviders();
			expect(remaining).toHaveLength(1);
			expect(remaining[0].api).toBe("core-api");
		});

		it("does nothing if sourceId does not match any provider", () => {
			registerApiProvider(createMockProvider("api-x"), "source-a");

			unregisterApiProviders("source-b");

			expect(getApiProviders()).toHaveLength(1);
		});

		it("does not remove providers registered without a sourceId", () => {
			registerApiProvider(createMockProvider("no-source-api")); // no sourceId
			registerApiProvider(createMockProvider("with-source-api"), "some-source");

			unregisterApiProviders("some-source");

			const remaining = getApiProviders();
			expect(remaining).toHaveLength(1);
			expect(remaining[0].api).toBe("no-source-api");
		});
	});

	// ---------------------------------------------------------------------------
	// clearApiProviders
	// ---------------------------------------------------------------------------

	describe("clearApiProviders", () => {
		it("clears all registered providers", () => {
			registerApiProvider(createMockProvider("a"));
			registerApiProvider(createMockProvider("b"));
			registerApiProvider(createMockProvider("c"));

			expect(getApiProviders()).toHaveLength(3);

			clearApiProviders();

			expect(getApiProviders()).toEqual([]);
			expect(getApiProvider("a")).toBeUndefined();
			expect(getApiProvider("b")).toBeUndefined();
			expect(getApiProvider("c")).toBeUndefined();
		});
	});

	// ---------------------------------------------------------------------------
	// Stream validation (wrapStream)
	// ---------------------------------------------------------------------------

	describe("stream validation", () => {
		it("throws 'Mismatched api' when model.api does not match the registered api", () => {
			const provider = createMockProvider("anthropic-messages");
			registerApiProvider(provider);

			const retrieved = getApiProvider("anthropic-messages")!;
			const wrongModel = createMockModel({ api: "openai-completions" as Api });

			expect(() => retrieved.stream(wrongModel, { messages: [] })).toThrow("Mismatched api");
			expect(() => retrieved.stream(wrongModel, { messages: [] })).toThrow(
				"Mismatched api: openai-completions expected anthropic-messages",
			);
		});

		it("throws 'Mismatched api' on streamSimple when model.api does not match", () => {
			const provider = createMockProvider("openai-completions");
			registerApiProvider(provider);

			const retrieved = getApiProvider("openai-completions")!;
			const wrongModel = createMockModel({ api: "google-generative-ai" as Api });

			expect(() => retrieved.streamSimple(wrongModel, { messages: [] })).toThrow(
				"Mismatched api: google-generative-ai expected openai-completions",
			);
		});

		it("does not throw when model.api matches the registered api", () => {
			const provider = createMockProvider("anthropic-messages");
			registerApiProvider(provider);

			const retrieved = getApiProvider("anthropic-messages")!;
			const correctModel = createMockModel({ api: "anthropic-messages" });

			expect(() => retrieved.stream(correctModel, { messages: [] })).not.toThrow();
			expect(() => retrieved.streamSimple(correctModel, { messages: [] })).not.toThrow();
		});
	});
});
