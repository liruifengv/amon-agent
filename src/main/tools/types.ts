import type { z } from 'zod';

export interface Tool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  cwd: string;
  signal: AbortSignal;
  onProgress?: (partial: ToolResult) => void;
}

export interface ToolResult {
  output: string;
  isError: boolean;
}
