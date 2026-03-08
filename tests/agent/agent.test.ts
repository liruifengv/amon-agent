import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "@/agent/agent";
import type { AgentOptions } from "@/agent/agent";
import { createMockModel } from "../_helpers/mock-models";
import {
	createAssistantMessage,
	createUserMessage,
	createToolResultMessage,
	createToolCallContent,
} from "../_helpers/mock-messages";
import { createScriptedStreamFn } from "../_helpers/mock-stream";

describe("Agent", () => {
	describe("default state", () => {
		it("has the correct default state", () => {
			const agent = new Agent();
			const state = agent.state;

			expect(state.systemPrompt).toBe("");
			expect(state.model.provider).toBe("google");
			expect(state.model.id).toBe("gemini-2.5-flash");
			expect(state.thinkingLevel).toBe("off");
			expect(state.tools).toEqual([]);
			expect(state.messages).toEqual([]);
			expect(state.isStreaming).toBe(false);
			expect(state.streamMessage).toBeNull();
			expect(state.pendingToolCalls.size).toBe(0);
			expect(state.error).toBeUndefined();
		});

		it("accepts initialState overrides", () => {
			const model = createMockModel();
			const agent = new Agent({
				initialState: {
					systemPrompt: "custom prompt",
					model,
					thinkingLevel: "high",
				},
			});

			expect(agent.state.systemPrompt).toBe("custom prompt");
			expect(agent.state.model).toBe(model);
			expect(agent.state.thinkingLevel).toBe("high");
		});
	});

	describe("state mutators", () => {
		let agent: Agent;

		beforeEach(() => {
			agent = new Agent({
				streamFn: createScriptedStreamFn([
					createAssistantMessage([{ type: "text", text: "ok" }]),
				]),
				initialState: { model: createMockModel() },
			});
		});

		it("setSystemPrompt updates system prompt", () => {
			agent.setSystemPrompt("new prompt");
			expect(agent.state.systemPrompt).toBe("new prompt");
		});

		it("setModel updates model", () => {
			const newModel = createMockModel({ id: "new-model" });
			agent.setModel(newModel);
			expect(agent.state.model.id).toBe("new-model");
		});

		it("setThinkingLevel updates thinking level", () => {
			agent.setThinkingLevel("medium");
			expect(agent.state.thinkingLevel).toBe("medium");
		});

		it("setTools updates tools array", () => {
			const tools = [{ name: "t", description: "d", label: "l", inputSchema: {} as any, execute: vi.fn() }];
			agent.setTools(tools);
			expect(agent.state.tools).toBe(tools);
		});
	});

	describe("message management", () => {
		let agent: Agent;

		beforeEach(() => {
			agent = new Agent({
				streamFn: createScriptedStreamFn([
					createAssistantMessage([{ type: "text", text: "ok" }]),
				]),
				initialState: { model: createMockModel() },
			});
		});

		it("replaceMessages creates a copy of the array", () => {
			const msgs = [createUserMessage("hello")];
			agent.replaceMessages(msgs);

			expect(agent.state.messages).toEqual(msgs);
			expect(agent.state.messages).not.toBe(msgs);
		});

		it("appendMessage appends to messages creating a new array", () => {
			const user1 = createUserMessage("first");
			agent.replaceMessages([user1]);
			const originalMessages = agent.state.messages;

			const user2 = createUserMessage("second");
			agent.appendMessage(user2);

			expect(agent.state.messages).toHaveLength(2);
			expect(agent.state.messages[1]).toBe(user2);
			expect(agent.state.messages).not.toBe(originalMessages);
		});

		it("clearMessages clears all messages", () => {
			agent.replaceMessages([createUserMessage("hello")]);
			agent.clearMessages();
			expect(agent.state.messages).toEqual([]);
		});
	});

	describe("subscribe", () => {
		it("returns an unsubscribe function", () => {
			const agent = new Agent({
				streamFn: createScriptedStreamFn([
					createAssistantMessage([{ type: "text", text: "ok" }]),
				]),
				initialState: { model: createMockModel() },
			});
			const listener = vi.fn();

			const unsubscribe = agent.subscribe(listener);
			expect(typeof unsubscribe).toBe("function");

			unsubscribe();
			// After unsubscribe, listener should not be called on future events
		});

		it("receives events during prompt execution", async () => {
			const events: any[] = [];
			const agent = new Agent({
				streamFn: createScriptedStreamFn([
					createAssistantMessage([{ type: "text", text: "Hello" }]),
				]),
				initialState: { model: createMockModel() },
			});

			agent.subscribe((e) => events.push(e));
			await agent.prompt("test");

			const types = events.map((e) => e.type);
			expect(types).toContain("agent_start");
			expect(types).toContain("message_start");
			expect(types).toContain("message_end");
			expect(types).toContain("agent_end");
		});

		it("stops receiving events after unsubscribe", async () => {
			const events: any[] = [];
			const agent = new Agent({
				streamFn: createScriptedStreamFn([
					createAssistantMessage([{ type: "text", text: "Hello" }]),
				]),
				initialState: { model: createMockModel() },
			});

			const unsub = agent.subscribe((e) => events.push(e));
			unsub();

			await agent.prompt("test");
			expect(events).toHaveLength(0);
		});
	});

	describe("queue management", () => {
		let agent: Agent;

		beforeEach(() => {
			agent = new Agent({
				streamFn: createScriptedStreamFn([
					createAssistantMessage([{ type: "text", text: "ok" }]),
				]),
				initialState: { model: createMockModel() },
			});
		});

		it("steer queues a steering message", () => {
			const msg = createUserMessage("steer");
			agent.steer(msg);
			expect(agent.hasQueuedMessages()).toBe(true);
		});

		it("followUp queues a follow-up message", () => {
			const msg = createUserMessage("followup");
			agent.followUp(msg);
			expect(agent.hasQueuedMessages()).toBe(true);
		});

		it("hasQueuedMessages returns false when both queues are empty", () => {
			expect(agent.hasQueuedMessages()).toBe(false);
		});

		it("hasQueuedMessages returns true with steering messages only", () => {
			agent.steer(createUserMessage("s"));
			expect(agent.hasQueuedMessages()).toBe(true);
		});

		it("hasQueuedMessages returns true with follow-up messages only", () => {
			agent.followUp(createUserMessage("f"));
			expect(agent.hasQueuedMessages()).toBe(true);
		});

		it("clearSteeringQueue clears only steering", () => {
			agent.steer(createUserMessage("s"));
			agent.followUp(createUserMessage("f"));

			agent.clearSteeringQueue();
			// Follow-up still queued
			expect(agent.hasQueuedMessages()).toBe(true);
		});

		it("clearFollowUpQueue clears only follow-up", () => {
			agent.steer(createUserMessage("s"));
			agent.followUp(createUserMessage("f"));

			agent.clearFollowUpQueue();
			// Steering still queued
			expect(agent.hasQueuedMessages()).toBe(true);
		});

		it("clearAllQueues clears both queues", () => {
			agent.steer(createUserMessage("s"));
			agent.followUp(createUserMessage("f"));

			agent.clearAllQueues();
			expect(agent.hasQueuedMessages()).toBe(false);
		});
	});

	describe("prompt", () => {
		it("with string creates UserMessage and runs the loop", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			await agent.prompt("test input");

			// Should have user message + assistant message
			expect(agent.state.messages.length).toBeGreaterThanOrEqual(2);
			expect(agent.state.messages[0].role).toBe("user");
			expect(agent.state.messages[1].role).toBe("assistant");
		});

		it("with AgentMessage runs the loop", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			const userMsg = createUserMessage("hi");
			await agent.prompt(userMsg);

			expect(agent.state.messages.length).toBeGreaterThanOrEqual(2);
			expect(agent.state.messages[0]).toBe(userMsg);
		});

		it("with AgentMessage array runs the loop", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			const msgs = [createUserMessage("a"), createUserMessage("b")];
			await agent.prompt(msgs);

			// Both user messages + assistant
			expect(agent.state.messages.length).toBeGreaterThanOrEqual(3);
		});

		it("throws when already streaming", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			// Start a prompt but do not await it
			const p = agent.prompt("first");

			await expect(agent.prompt("second")).rejects.toThrow("already processing");

			await p;
		});

		it("sets isStreaming to true during execution and false after", async () => {
			let wasSteamingDuringExec = false;
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			agent.subscribe((e) => {
				if (e.type === "agent_start") {
					wasSteamingDuringExec = agent.state.isStreaming;
				}
			});

			await agent.prompt("test");

			expect(wasSteamingDuringExec).toBe(true);
			expect(agent.state.isStreaming).toBe(false);
		});
	});

	describe("continue", () => {
		it("throws with no messages", async () => {
			const agent = new Agent({
				streamFn: createScriptedStreamFn([]),
				initialState: { model: createMockModel() },
			});

			await expect(agent.continue()).rejects.toThrow("No messages to continue from");
		});

		it("throws when last message is assistant (without queued messages)", async () => {
			const agent = new Agent({
				streamFn: createScriptedStreamFn([]),
				initialState: { model: createMockModel() },
			});

			agent.replaceMessages([
				createUserMessage("hello"),
				createAssistantMessage([{ type: "text", text: "hi" }]),
			]);

			await expect(agent.continue()).rejects.toThrow("Cannot continue from message role: assistant");
		});

		it("works from a toolResult message", async () => {
			const tc = createToolCallContent({ id: "tc_1" });
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "done" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			agent.replaceMessages([
				createUserMessage("hello"),
				createAssistantMessage([tc]),
				createToolResultMessage("tc_1", "result"),
			]);

			await agent.continue();

			// Should have appended the assistant response
			const lastMsg = agent.state.messages[agent.state.messages.length - 1];
			expect(lastMsg.role).toBe("assistant");
		});

		it("throws when already streaming", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "ok" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			const p = agent.prompt("start");

			await expect(agent.continue()).rejects.toThrow("already processing");

			await p;
		});
	});

	describe("abort", () => {
		it("aborts in-progress processing", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			// Start prompt and immediately abort
			const p = agent.prompt("test");
			agent.abort();

			await p;

			// After abort, agent should not be streaming
			expect(agent.state.isStreaming).toBe(false);
		});
	});

	describe("waitForIdle", () => {
		it("resolves immediately when not running", async () => {
			const agent = new Agent({
				streamFn: createScriptedStreamFn([]),
				initialState: { model: createMockModel() },
			});

			// Should resolve immediately
			await agent.waitForIdle();
		});

		it("resolves when the running prompt completes", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			const p = agent.prompt("test");

			// waitForIdle should resolve after prompt finishes
			await agent.waitForIdle();
			await p;

			expect(agent.state.isStreaming).toBe(false);
		});
	});

	describe("reset", () => {
		it("clears messages, streaming state, and queues", async () => {
			const streamFn = createScriptedStreamFn([
				createAssistantMessage([{ type: "text", text: "Hello" }]),
			]);
			const agent = new Agent({
				streamFn,
				initialState: { model: createMockModel() },
			});

			await agent.prompt("test");

			agent.steer(createUserMessage("s"));
			agent.followUp(createUserMessage("f"));

			agent.reset();

			expect(agent.state.messages).toEqual([]);
			expect(agent.state.isStreaming).toBe(false);
			expect(agent.state.streamMessage).toBeNull();
			expect(agent.state.pendingToolCalls.size).toBe(0);
			expect(agent.state.error).toBeUndefined();
			expect(agent.hasQueuedMessages()).toBe(false);
		});
	});
});
