import type { z } from 'zod';
import type { QuestionToolUpdate } from '@shared/question-types';

export interface Tool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  cwd: string;
  signal: AbortSignal;
  sessionId?: string;
  toolCallId?: string;
  onProgress?: (partial: ToolResult) => void;
  onQuestionUpdate?: (update: QuestionToolUpdate) => void;
}

export interface ToolResult {
  output: string;
  isError: boolean;
  details?: unknown;
}
