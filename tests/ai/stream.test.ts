import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockModel } from "../_helpers/mock-models";
import { createAssistantMessage } from "../_helpers/mock-messages";
import { AssistantMessageEventStream } from "@/ai/utils/event-stream";
import type { AssistantMessage, Context } from "@/ai/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStream = vi.fn();
const mockStreamSimple = vi.fn();
const mockGetApiProvider = vi.fn();

vi.mock("@/ai/api-registry", () => ({
	getApiProvider: (...args: unknown[]) => mockGetApiProvider(...args),
}));

// Mock register-builtins to prevent side effects
vi.mock("@/ai/providers/register-builtins", () => ({}));

// Import after mocks are set up
const { stream, complete, streamSimple, completeSimple } = await import("@/ai/stream");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventStream(message: AssistantMessage): AssistantMessageEventStream {
	const es = new AssistantMessageEventStream();
	// Push events asynchronously so result() can resolve
	queueMicrotask(() => {
		es.push({ type: "start", partial: message });
		es.push({ type: "done", reason: "stop", message });
	});
	return es;
}

const defaultContext: Context = {
	systemPrompt: "You are a helpful assistant.",
	messages: [],
	tools: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stream module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStream.mockReset();
		mockStreamSimple.mockReset();
		mockGetApiProvider.mockReset();
	});

	// ---------------------------------------------------------------------------
	// stream()
	// ---------------------------------------------------------------------------

	describe("stream()", () => {
		it("calls provider.stream with correct arguments", () => {
			const model = createMockModel();
			const eventStream = new AssistantMessageEventStream();
			mockStream.mockReturnValue(eventStream);
			mockGetApiProvider.mockReturnValue({ stream: mockStream, streamSimple: mockStreamSimple });

			const options = { temperature: 0.7 };
			const result = stream(model, defaultContext, options);

			expect(mockGetApiProvider).toHaveBeenCalledWith(model.api);
			expect(mockStream).toHaveBeenCalledWith(model, defaultContext, options);
			expect(result).toBe(eventStream);
		});

		it("throws when no provider is registered for the api", () => {
			const model = createMockModel({ api: "unknown-api" as any });
			mockGetApiProvider.mockReturnValue(undefined);

			expect(() => stream(model, defaultContext)).toThrow(
				"No API provider registered for api: unknown-api",
			);
		});
	});

	// ---------------------------------------------------------------------------
	// streamSimple()
	// ---------------------------------------------------------------------------

	describe("streamSimple()", () => {
		it("calls provider.streamSimple with correct arguments", () => {
			const model = createMockModel();
			const eventStream = new AssistantMessageEventStream();
			mockStreamSimple.mockReturnValue(eventStream);
			mockGetApiProvider.mockReturnValue({ stream: mockStream, streamSimple: mockStreamSimple });

			const options = { reasoning: "medium" as const };
			const result = streamSimple(model, defaultContext, options);

			expect(mockGetApiProvider).toHaveBeenCalledWith(model.api);
			expect(mockStreamSimple).toHaveBeenCalledWith(model, defaultContext, options);
			expect(result).toBe(eventStream);
		});

		it("throws when no provider is registered for the api", () => {
			const model = createMockModel({ api: "missing-api" as any });
			mockGetApiProvider.mockReturnValue(undefined);

			expect(() => streamSimple(model, defaultContext)).toThrow(
				"No API provider registered for api: missing-api",
			);
		});
	});

	// ---------------------------------------------------------------------------
	// complete()
	// ---------------------------------------------------------------------------

	describe("complete()", () => {
		it("awaits stream result and returns the assistant message", async () => {
			const model = createMockModel();
			const message = createAssistantMessage([{ type: "text", text: "response" }]);
			const eventStream = createMockEventStream(message);
			mockStream.mockReturnValue(eventStream);
			mockGetApiProvider.mockReturnValue({ stream: mockStream, streamSimple: mockStreamSimple });

			const result = await complete(model, defaultContext);

			expect(mockStream).toHaveBeenCalledWith(model, defaultContext, undefined);
			expect(result).toBe(message);
			expect(result.role).toBe("assistant");
		});

		it("throws when no provider is registered", async () => {
			const model = createMockModel({ api: "no-provider" as any });
			mockGetApiProvider.mockReturnValue(undefined);

			await expect(complete(model, defaultContext)).rejects.toThrow(
				"No API provider registered for api: no-provider",
			);
		});
	});

	// ---------------------------------------------------------------------------
	// completeSimple()
	// ---------------------------------------------------------------------------

	describe("completeSimple()", () => {
		it("awaits streamSimple result and returns the assistant message", async () => {
			const model = createMockModel();
			const message = createAssistantMessage([{ type: "text", text: "simple response" }]);
			const eventStream = createMockEventStream(message);
			mockStreamSimple.mockReturnValue(eventStream);
			mockGetApiProvider.mockReturnValue({ stream: mockStream, streamSimple: mockStreamSimple });

			const options = { reasoning: "low" as const };
			const result = await completeSimple(model, defaultContext, options);

			expect(mockStreamSimple).toHaveBeenCalledWith(model, defaultContext, options);
			expect(result).toBe(message);
		});

		it("throws when no provider is registered", async () => {
			const model = createMockModel({ api: "absent-api" as any });
			mockGetApiProvider.mockReturnValue(undefined);

			await expect(completeSimple(model, defaultContext)).rejects.toThrow(
				"No API provider registered for api: absent-api",
			);
		});
	});
});
