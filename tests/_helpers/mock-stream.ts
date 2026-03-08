import { AssistantMessageEventStream } from "@/ai/utils/event-stream";
import type { AssistantMessage, AssistantMessageEvent } from "@/ai/types";
import type { StreamFn } from "@/agent/types";
import { createAssistantMessage } from "./mock-messages";

/**
 * MockAssistantStream that emits scripted events via queueMicrotask.
 */
export class MockAssistantStream extends AssistantMessageEventStream {
	constructor(message: AssistantMessage) {
		super();
		queueMicrotask(() => {
			this.push({ type: "start", partial: message });
			this.push(
				message.stopReason === "error" || message.stopReason === "aborted"
					? { type: "error", reason: message.stopReason, error: message }
					: { type: "done", reason: message.stopReason as "stop" | "length" | "toolUse", message },
			);
		});
	}
}

/**
 * Creates a stream function that returns scripted responses in order.
 * Each call to the returned function returns the next response from the sequence.
 */
export function createScriptedStreamFn(responses: AssistantMessage[]): StreamFn {
	let callIndex = 0;
	return () => {
		const response = responses[callIndex] ?? createAssistantMessage([{ type: "text", text: "fallback" }]);
		callIndex++;
		return new MockAssistantStream(response);
	};
}
