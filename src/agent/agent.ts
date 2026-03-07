import type { Model, ThinkingLevel, Message } from "../ai";
import type { EventStream } from "../ai/utils/event-stream";
import type {
	AgentTool,
	AgentMessage,
	AgentEvent,
	AgentState,
} from "./types";
import { agentLoop, agentLoopContinue } from "./agent-loop";

export class Agent {
	private state: AgentState;
	private abortController: AbortController | null = null;
	private steeringQueue: AgentMessage[] = [];
	private followUpQueue: AgentMessage[] = [];
	private eventListeners: Set<(event: AgentEvent) => void> = new Set();
	private idleResolvers: Set<() => void> = new Set();
	private convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	private transformContext?: (messages: AgentMessage[]) => AgentMessage[] | Promise<AgentMessage[]>;
	private maxTurns: number;

	constructor(config: {
		model: Model;
		systemPrompt: string;
		tools: AgentTool[];
		thinkingLevel?: ThinkingLevel;
		convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
		transformContext?: (messages: AgentMessage[]) => AgentMessage[] | Promise<AgentMessage[]>;
		maxTurns?: number;
	}) {
		this.state = {
			systemPrompt: config.systemPrompt,
			model: config.model,
			thinkingLevel: config.thinkingLevel,
			tools: config.tools,
			messages: [],
			isStreaming: false,
			streamMessage: null,
			pendingToolCalls: new Set(),
		};
		this.convertToLlm = config.convertToLlm;
		this.transformContext = config.transformContext;
		this.maxTurns = config.maxTurns ?? 30;
	}

	/** Send a prompt to the agent. Can be a string or pre-built messages. */
	prompt(input: string | AgentMessage[]): void {
		if (this.state.isStreaming) {
			this.abort();
		}

		const prompts: AgentMessage[] =
			typeof input === "string"
				? [{ role: "user", content: [{ type: "text", text: input }], timestamp: Date.now() }]
				: input;

		this.startLoop(prompts);
	}

	/** Continue the agent from existing context. */
	continue(): void {
		if (this.state.isStreaming) return;
		this.startLoopContinue();
	}

	/** Abort the current run. */
	abort(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.finishStreaming();
	}

	/** Reset the agent state, clearing all messages and queues. */
	reset(): void {
		this.abort();
		this.state = {
			...this.state,
			messages: [],
			isStreaming: false,
			streamMessage: null,
			pendingToolCalls: new Set(),
			error: undefined,
		};
		this.steeringQueue = [];
		this.followUpQueue = [];
	}

	/** Add a steering message to be injected, interrupting current tool execution. */
	steer(message: AgentMessage): void {
		this.steeringQueue.push(message);
	}

	/** Add a follow-up message to be processed after the current loop ends. */
	followUp(message: AgentMessage): void {
		this.followUpQueue.push(message);
	}

	getState(): Readonly<AgentState> {
		return this.state;
	}

	isRunning(): boolean {
		return this.state.isStreaming;
	}

	/** Returns a Promise that resolves when the agent is no longer streaming. */
	waitForIdle(): Promise<void> {
		if (!this.state.isStreaming) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.idleResolvers.add(resolve);
		});
	}

	/** Subscribe to agent events. Returns an unsubscribe function. */
	on(listener: (event: AgentEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}

	setModel(model: Model): void {
		this.state = { ...this.state, model };
	}

	setSystemPrompt(prompt: string): void {
		this.state = { ...this.state, systemPrompt: prompt };
	}

	setTools(tools: AgentTool[]): void {
		this.state = { ...this.state, tools };
	}

	setThinkingLevel(level: ThinkingLevel | undefined): void {
		this.state = { ...this.state, thinkingLevel: level };
	}

	// ---------- Private ----------

	private buildConfig() {
		return {
			model: this.state.model,
			systemPrompt: this.state.systemPrompt,
			tools: this.state.tools,
			maxTurns: this.maxTurns,
			streamOptions: this.state.thinkingLevel
				? { reasoning: this.state.thinkingLevel }
				: undefined,
			convertToLlm: this.convertToLlm,
			transformContext: this.transformContext,
			getSteeringMessages: () => {
				if (this.steeringQueue.length === 0) return undefined;
				const msgs = [...this.steeringQueue];
				this.steeringQueue = [];
				return msgs;
			},
			getFollowUpMessages: () => {
				if (this.followUpQueue.length === 0) return undefined;
				const msgs = [...this.followUpQueue];
				this.followUpQueue = [];
				return msgs;
			},
		};
	}

	private startLoop(prompts: AgentMessage[]): void {
		this.state = { ...this.state, isStreaming: true, error: undefined };
		this.abortController = new AbortController();

		const config = this.buildConfig();
		const stream = agentLoop(prompts, this.state.messages, config, this.abortController.signal);
		this.consumeStream(stream);
	}

	private startLoopContinue(): void {
		this.state = { ...this.state, isStreaming: true, error: undefined };
		this.abortController = new AbortController();

		const config = this.buildConfig();
		const stream = agentLoopContinue(this.state.messages, config, this.abortController.signal);
		this.consumeStream(stream);
	}

	private async consumeStream(stream: EventStream<AgentEvent, AgentMessage[]>): Promise<void> {
		try {
			for await (const event of stream) {
				this.handleEvent(event);
			}
			const finalMessages = await stream.result();
			if (finalMessages) {
				this.state = { ...this.state, messages: finalMessages };
			}
			this.finishStreaming();
		} catch (error) {
			this.state = {
				...this.state,
				error: error instanceof Error ? error.message : String(error),
			};
			this.finishStreaming();
		}
	}

	private handleEvent(event: AgentEvent): void {
		// Update internal state based on event
		switch (event.type) {
			case "message_start":
				this.state = { ...this.state, streamMessage: event.message };
				break;
			case "message_update":
				this.state = { ...this.state, streamMessage: event.message };
				break;
			case "message_end":
				this.state = { ...this.state, streamMessage: null };
				break;
			case "tool_execution_start":
				this.state.pendingToolCalls.add(event.toolCallId);
				break;
			case "tool_execution_end":
				this.state.pendingToolCalls.delete(event.toolCallId);
				break;
		}

		// Forward to listeners
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch {
				// Listener errors should not break the agent
			}
		}
	}

	private finishStreaming(): void {
		this.state = {
			...this.state,
			isStreaming: false,
			streamMessage: null,
			pendingToolCalls: new Set(),
		};
		this.abortController = null;

		// Resolve all idle waiters
		for (const resolve of this.idleResolvers) {
			resolve();
		}
		this.idleResolvers.clear();
	}
}
