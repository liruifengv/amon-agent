import { describe, it, expect, vi, beforeEach } from "vitest";
import { agentLoop, agentLoopContinue } from "@/agent/agent-loop";
import { createMockModel } from "../_helpers/mock-models";
import {
	createAssistantMessage,
	createUserMessage,
	createToolCallContent,
	createToolResultMessage,
} from "../_helpers/mock-messages";
import { createScriptedStreamFn } from "../_helpers/mock-stream";
import { createMockTool, createEchoTool, createFailingTool } from "../_helpers/mock-tools";
import type { AgentLoopConfig, AgentContext, AgentEvent } from "@/agent/types";

function createConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
	return {
		model: createMockModel(),
		convertToLlm: (msgs) =>
			msgs.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"),
		...overrides,
	};
}

function createContext(overrides?: Partial<AgentContext>): AgentContext {
	return {
		systemPrompt: "",
		messages: [],
		tools: [],
		...overrides,
	};
}

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}
	return events;
}

describe("agentLoop", () => {
	describe("basic flow", () => {
		it("emits agent_start, message events for prompts, then assistant response, agent_end", async () => {
			const assistantMsg = createAssistantMessage([{ type: "text", text: "Hello" }]);
			const streamFn = createScriptedStreamFn([assistantMsg]);
			const userMsg = createUserMessage("hi");

			const stream = agentLoop(
				[userMsg],
				createContext(),
				createConfig(),
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);
			const types = events.map((e) => e.type);

			expect(types[0]).toBe("agent_start");
			expect(types[1]).toBe("turn_start");
			// message_start/end for the user prompt
			expect(types).toContain("message_start");
			expect(types).toContain("message_end");
			expect(types).toContain("turn_end");
			expect(types[types.length - 1]).toBe("agent_end");
		});

		it("with text-only response (no tool calls) completes in a single turn", async () => {
			const assistantMsg = createAssistantMessage([{ type: "text", text: "Hi there" }]);
			const streamFn = createScriptedStreamFn([assistantMsg]);

			const stream = agentLoop(
				[createUserMessage("hello")],
				createContext(),
				createConfig(),
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);
			const turnEnds = events.filter((e) => e.type === "turn_end");

			expect(turnEnds).toHaveLength(1);

			const agentEnd = events.find((e) => e.type === "agent_end");
			expect(agentEnd).toBeDefined();
		});
	});

	describe("tool call flow", () => {
		it("executes tool and continues loop", async () => {
			const tc = createToolCallContent({
				id: "tc_1",
				name: "mock_tool",
				arguments: { input: "test" },
			});
			const assistantWithTool = createAssistantMessage([tc], { stopReason: "toolUse" });
			const assistantFinal = createAssistantMessage([{ type: "text", text: "Done" }]);
			const streamFn = createScriptedStreamFn([assistantWithTool, assistantFinal]);

			const tool = createMockTool("mock_tool");

			const stream = agentLoop(
				[createUserMessage("run tool")],
				createContext({ tools: [tool] }),
				createConfig(),
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);
			const types = events.map((e) => e.type);

			expect(types).toContain("tool_execution_start");
			expect(types).toContain("tool_execution_end");
			expect(tool.execute).toHaveBeenCalled();

			// Two turns: one with tool call, one with final text
			const turnEnds = events.filter((e) => e.type === "turn_end");
			expect(turnEnds.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("error handling", () => {
		it("exits immediately on error response", async () => {
			const errorMsg = createAssistantMessage(
				[{ type: "text", text: "" }],
				{ stopReason: "error", errorMessage: "API error" },
			);
			const streamFn = createScriptedStreamFn([errorMsg]);

			const stream = agentLoop(
				[createUserMessage("hi")],
				createContext(),
				createConfig(),
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);
			const types = events.map((e) => e.type);

			expect(types).toContain("turn_end");
			expect(types).toContain("agent_end");

			// Should not have a second turn
			const turnStarts = events.filter((e) => e.type === "turn_start");
			expect(turnStarts).toHaveLength(1);
		});
	});

	describe("tool execution validation", () => {
		it("returns error result on Zod validation failure", async () => {
			const tc = createToolCallContent({
				id: "tc_bad",
				name: "echo",
				arguments: { wrong_field: "value" },
			});
			const assistantWithTool = createAssistantMessage([tc], { stopReason: "toolUse" });
			const assistantFinal = createAssistantMessage([{ type: "text", text: "ok" }]);
			const streamFn = createScriptedStreamFn([assistantWithTool, assistantFinal]);

			const echoTool = createEchoTool();

			const stream = agentLoop(
				[createUserMessage("test")],
				createContext({ tools: [echoTool] }),
				createConfig(),
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);
			const toolEnd = events.find(
				(e) => e.type === "tool_execution_end" && e.toolCallId === "tc_bad",
			) as any;

			expect(toolEnd).toBeDefined();
			expect(toolEnd.isError).toBe(true);
			expect(toolEnd.result.content[0].text).toContain("Validation failed");
		});

		it("returns error result when tool is not found", async () => {
			const tc = createToolCallContent({
				id: "tc_missing",
				name: "nonexistent_tool",
				arguments: {},
			});
			const assistantWithTool = createAssistantMessage([tc], { stopReason: "toolUse" });
			const assistantFinal = createAssistantMessage([{ type: "text", text: "ok" }]);
			const streamFn = createScriptedStreamFn([assistantWithTool, assistantFinal]);

			const stream = agentLoop(
				[createUserMessage("test")],
				createContext({ tools: [] }),
				createConfig(),
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);
			const toolEnd = events.find(
				(e) => e.type === "tool_execution_end" && e.toolCallId === "tc_missing",
			) as any;

			expect(toolEnd).toBeDefined();
			expect(toolEnd.isError).toBe(true);
			expect(toolEnd.result.content[0].text).toContain("not found");
		});
	});

	describe("steering", () => {
		it("interrupts tool execution and skips remaining tools with 'Skipped' message", async () => {
			const tc1 = createToolCallContent({ id: "tc_1", name: "mock_tool", arguments: {} });
			const tc2 = createToolCallContent({ id: "tc_2", name: "mock_tool", arguments: {} });
			const assistantWithTools = createAssistantMessage([tc1, tc2], { stopReason: "toolUse" });
			const assistantFinal = createAssistantMessage([{ type: "text", text: "done" }]);
			const streamFn = createScriptedStreamFn([assistantWithTools, assistantFinal]);

			const tool = createMockTool("mock_tool");

			let steeringCallCount = 0;
			const config = createConfig({
				getSteeringMessages: async () => {
					steeringCallCount++;
					// Call 1: initial check at start of runLoop (returns nothing)
					// Call 2: check after first tool execution inside executeToolCalls (return steering to interrupt)
					if (steeringCallCount === 2) {
						return [createUserMessage("interrupt!")];
					}
					return [];
				},
			});

			const stream = agentLoop(
				[createUserMessage("test")],
				createContext({ tools: [tool] }),
				config,
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);

			// First tool should be executed normally
			const toolEndEvents = events.filter((e) => e.type === "tool_execution_end") as any[];
			expect(toolEndEvents.length).toBe(2);

			// First tool: not error (executed normally)
			expect(toolEndEvents[0].isError).toBe(false);

			// Second tool: skipped (error with "Skipped" message)
			expect(toolEndEvents[1].isError).toBe(true);
			expect(toolEndEvents[1].result.content[0].text).toContain("Skipped");
		});
	});

	describe("follow-up messages", () => {
		it("trigger another loop iteration after agent would stop", async () => {
			const assistantFirst = createAssistantMessage([{ type: "text", text: "first" }]);
			const assistantSecond = createAssistantMessage([{ type: "text", text: "second" }]);
			const streamFn = createScriptedStreamFn([assistantFirst, assistantSecond]);

			let followUpCallCount = 0;
			const config = createConfig({
				getFollowUpMessages: async () => {
					followUpCallCount++;
					if (followUpCallCount === 1) {
						return [createUserMessage("follow up")];
					}
					return [];
				},
			});

			const stream = agentLoop(
				[createUserMessage("start")],
				createContext(),
				config,
				undefined,
				streamFn,
			);

			const events = await collectEvents(stream);

			// Should have at least 2 turn_end events (one for each assistant response)
			const turnEnds = events.filter((e) => e.type === "turn_end");
			expect(turnEnds.length).toBeGreaterThanOrEqual(2);

			// The final agent_end should include messages from both turns
			const agentEnd = events.find((e) => e.type === "agent_end") as any;
			expect(agentEnd).toBeDefined();
			expect(agentEnd.messages.length).toBeGreaterThanOrEqual(3);
		});
	});
});

describe("agentLoopContinue", () => {
	it("throws with no messages", () => {
		expect(() =>
			agentLoopContinue(createContext({ messages: [] }), createConfig()),
		).toThrow("no messages");
	});

	it("throws when last message is assistant", () => {
		const assistant = createAssistantMessage([{ type: "text", text: "hi" }]);

		expect(() =>
			agentLoopContinue(
				createContext({ messages: [createUserMessage("hello"), assistant] }),
				createConfig(),
			),
		).toThrow("Cannot continue from message role: assistant");
	});

	it("works with toolResult as last message", async () => {
		const tc = createToolCallContent({ id: "tc_1" });
		const assistant = createAssistantMessage([tc], { stopReason: "toolUse" });
		const toolResult = createToolResultMessage("tc_1", "result data");
		const finalAssistant = createAssistantMessage([{ type: "text", text: "final" }]);
		const streamFn = createScriptedStreamFn([finalAssistant]);

		const stream = agentLoopContinue(
			createContext({
				messages: [createUserMessage("hello"), assistant, toolResult],
			}),
			createConfig(),
			undefined,
			streamFn,
		);

		const events = await collectEvents(stream);
		const types = events.map((e) => e.type);

		expect(types).toContain("agent_start");
		expect(types).toContain("agent_end");

		const agentEnd = events.find((e) => e.type === "agent_end") as any;
		expect(agentEnd.messages.length).toBeGreaterThanOrEqual(1);
	});

	it("works with user message as last message", async () => {
		const finalAssistant = createAssistantMessage([{ type: "text", text: "response" }]);
		const streamFn = createScriptedStreamFn([finalAssistant]);

		const stream = agentLoopContinue(
			createContext({
				messages: [createUserMessage("hello")],
			}),
			createConfig(),
			undefined,
			streamFn,
		);

		const events = await collectEvents(stream);
		const types = events.map((e) => e.type);

		expect(types).toContain("agent_start");
		expect(types).toContain("agent_end");
	});
});
