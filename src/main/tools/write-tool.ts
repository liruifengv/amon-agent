import { mkdir as fsMkdir, writeFile as fsWriteFile } from 'fs/promises';
import { dirname } from 'path';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from './types';
import { resolveToCwd } from './utils/path-utils';

const writeInputSchema = z.object({
  file_path: z.string().describe('Path to the file to write (relative or absolute)'),
  content: z.string().describe('Content to write to the file'),
});

type WriteInput = z.infer<typeof writeInputSchema>;

export const writeTool: Tool<WriteInput> = {
  name: 'Write',
  description:
    "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
  inputSchema: writeInputSchema,
  execute: async (input: WriteInput, context: ToolContext): Promise<ToolResult> => {
    const { file_path, content } = input;
    const { cwd, signal } = context;

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const absolutePath = resolveToCwd(file_path, cwd);
    const dir = dirname(absolutePath);

    try {
      await fsMkdir(dir, { recursive: true });

      if (signal?.aborted) {
        return { output: 'Operation aborted', isError: true };
      }

      await fsWriteFile(absolutePath, content, 'utf-8');

      return {
        output: `Successfully wrote ${content.length} bytes to ${file_path}`,
        isError: false,
      };
    } catch (error) {
      return { output: String(error), isError: true };
    }
  },
};
