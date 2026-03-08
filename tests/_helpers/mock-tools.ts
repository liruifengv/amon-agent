import { z } from "zod";
import { vi } from "vitest";
import type { AgentTool, AgentToolResult } from "@/agent/types";

export function createMockTool(name = "mock_tool"): AgentTool<{ input?: string }, Record<string, never>> {
	return {
		name,
		description: `Mock tool: ${name}`,
		label: name,
		inputSchema: z.object({ input: z.string().optional() }),
		execute: vi.fn(async (_toolCallId: string, _input: { input?: string }) => ({
			content: [{ type: "text" as const, text: `${name} executed` }],
			details: {},
		})),
	};
}

export function createEchoTool(): AgentTool<{ input: string }, Record<string, never>> {
	return {
		name: "echo",
		description: "Echoes input back",
		label: "echo",
		inputSchema: z.object({ input: z.string() }),
		execute: vi.fn(async (_toolCallId: string, input: { input: string }) => ({
			content: [{ type: "text" as const, text: input.input }],
			details: {},
		})),
	};
}

export function createFailingTool(errorMessage = "Tool error"): AgentTool<Record<string, never>, Record<string, never>> {
	return {
		name: "failing_tool",
		description: "Always fails",
		label: "failing_tool",
		inputSchema: z.object({}),
		execute: vi.fn(async () => {
			throw new Error(errorMessage);
		}),
	};
}
