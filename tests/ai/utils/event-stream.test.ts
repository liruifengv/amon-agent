import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventStream, AssistantMessageEventStream, createAssistantMessageEventStream } from "@/ai/utils/event-stream";
import type { AssistantMessageEvent, AssistantMessage } from "@/ai/types";
import { createAssistantMessage, createUsage } from "../../_helpers/mock-messages";

// ---------------------------------------------------------------------------
// EventStream (generic)
// ---------------------------------------------------------------------------

describe("EventStream", () => {
	function createNumberStream() {
		return new EventStream<number, number>(
			(event) => event < 0, // negative number signals completion
			(event) => event, // extract the event itself as result
		);
	}

	it("push events and collect via for-await-of, verifying ordering", async () => {
		const stream = createNumberStream();

		// Push all events synchronously, then end
		stream.push(1);
		stream.push(2);
		stream.push(3);
		stream.end();

		const collected: number[] = [];
		for await (const event of stream) {
			collected.push(event);
		}

		expect(collected).toEqual([1, 2, 3]);
	});

	it("delivers buffered events that were pushed before consuming", async () => {
		const stream = createNumberStream();

		// Buffer events before any consumer exists
		stream.push(10);
		stream.push(20);
		stream.push(30);
		stream.end();

		const collected: number[] = [];
		for await (const event of stream) {
			collected.push(event);
		}

		expect(collected).toEqual([10, 20, 30]);
	});

	it("delivers real-time events pushed after consumer awaits", async () => {
		const stream = createNumberStream();

		const collectPromise = (async () => {
			const collected: number[] = [];
			for await (const event of stream) {
				collected.push(event);
			}
			return collected;
		})();

		// Push events asynchronously after consumer is waiting
		await Promise.resolve(); // yield to let consumer start awaiting
		stream.push(100);
		stream.push(200);
		stream.end();

		const collected = await collectPromise;
		expect(collected).toEqual([100, 200]);
	});

	it("end() terminates iteration", async () => {
		const stream = createNumberStream();

		const collectPromise = (async () => {
			const collected: number[] = [];
			for await (const event of stream) {
				collected.push(event);
			}
			return collected;
		})();

		stream.push(1);
		stream.end();

		const collected = await collectPromise;
		expect(collected).toEqual([1]);
	});

	it("end() with result resolves result()", async () => {
		const stream = createNumberStream();
		stream.end(42);

		const result = await stream.result();
		expect(result).toBe(42);
	});

	it("result() resolves when a complete event is pushed", async () => {
		const stream = createNumberStream();

		// Push normal events, then a "complete" event (negative)
		stream.push(1);
		stream.push(2);
		stream.push(-99); // triggers isComplete

		const result = await stream.result();
		expect(result).toBe(-99);
	});

	it("push after done is ignored", async () => {
		const stream = createNumberStream();

		stream.push(1);
		stream.end();
		stream.push(2); // should be ignored
		stream.push(3); // should be ignored

		const collected: number[] = [];
		for await (const event of stream) {
			collected.push(event);
		}

		expect(collected).toEqual([1]);
	});

	it("push after complete event is ignored", async () => {
		const stream = createNumberStream();

		stream.push(1);
		stream.push(-1); // triggers isComplete, sets done = true
		stream.push(99); // should be ignored because done

		const collected: number[] = [];
		for await (const event of stream) {
			collected.push(event);
		}

		// The complete event itself is still delivered
		expect(collected).toEqual([1, -1]);
		expect(collected).not.toContain(99);
	});

	it("end() without result does not resolve result() if never pushed a complete event", async () => {
		const stream = createNumberStream();
		stream.push(1);
		stream.end(); // no result argument, no complete event pushed

		// result() should remain pending (never resolves)
		let resolved = false;
		const race = Promise.race([
			stream.result().then(() => {
				resolved = true;
			}),
			new Promise((r) => setTimeout(r, 50)),
		]);
		await race;
		expect(resolved).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AssistantMessageEventStream
// ---------------------------------------------------------------------------

describe("AssistantMessageEventStream", () => {
	it("done event completes with the assistant message", async () => {
		const stream = new AssistantMessageEventStream();
		const message = createAssistantMessage([{ type: "text", text: "Hello" }]);

		const partial = createAssistantMessage([{ type: "text", text: "Hel" }]);
		stream.push({ type: "start", partial });
		stream.push({ type: "text_delta", contentIndex: 0, delta: "lo", partial: message });
		stream.push({ type: "done", reason: "stop", message });

		const result = await stream.result();
		expect(result).toBe(message);
		expect(result.role).toBe("assistant");
		expect((result.content[0] as { type: "text"; text: string }).text).toBe("Hello");
	});

	it("error event completes with the error message", async () => {
		const stream = new AssistantMessageEventStream();
		const errorMsg = createAssistantMessage(
			[{ type: "text", text: "Something went wrong" }],
			{ stopReason: "error", errorMessage: "API error" },
		);

		stream.push({ type: "start", partial: errorMsg });
		stream.push({ type: "error", reason: "error", error: errorMsg });

		const result = await stream.result();
		expect(result).toBe(errorMsg);
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toBe("API error");
	});

	it("aborted error event completes with the error message", async () => {
		const stream = new AssistantMessageEventStream();
		const abortedMsg = createAssistantMessage(
			[{ type: "text", text: "Aborted" }],
			{ stopReason: "aborted" },
		);

		stream.push({ type: "error", reason: "aborted", error: abortedMsg });

		const result = await stream.result();
		expect(result).toBe(abortedMsg);
	});

	it("collects all events in order via async iteration", async () => {
		const stream = new AssistantMessageEventStream();
		const partial = createAssistantMessage([{ type: "text", text: "" }]);
		const finalMsg = createAssistantMessage([{ type: "text", text: "Hi" }]);

		stream.push({ type: "start", partial });
		stream.push({ type: "text_delta", contentIndex: 0, delta: "Hi", partial: finalMsg });
		stream.push({ type: "done", reason: "stop", message: finalMsg });

		const types: string[] = [];
		for await (const event of stream) {
			types.push(event.type);
		}

		expect(types).toEqual(["start", "text_delta", "done"]);
	});

	it("stops iteration after done event when end() is called", async () => {
		const stream = new AssistantMessageEventStream();
		const msg = createAssistantMessage([{ type: "text", text: "test" }]);

		stream.push({ type: "done", reason: "stop", message: msg });
		// The done event marks the stream as complete, but we still need to
		// ensure the iterator terminates. Since done sets this.done = true,
		// the iterator will stop after delivering the done event.

		const types: string[] = [];
		for await (const event of stream) {
			types.push(event.type);
		}
		expect(types).toEqual(["done"]);
	});
});

// ---------------------------------------------------------------------------
// createAssistantMessageEventStream factory
// ---------------------------------------------------------------------------

describe("createAssistantMessageEventStream", () => {
	it("returns an instance of AssistantMessageEventStream", () => {
		const stream = createAssistantMessageEventStream();
		expect(stream).toBeInstanceOf(AssistantMessageEventStream);
		expect(stream).toBeInstanceOf(EventStream);
	});

	it("returned stream is functional", async () => {
		const stream = createAssistantMessageEventStream();
		const message = createAssistantMessage([{ type: "text", text: "factory test" }]);

		stream.push({ type: "done", reason: "stop", message });

		const result = await stream.result();
		expect(result).toBe(message);
	});
});
