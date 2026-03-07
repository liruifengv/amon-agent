import { existsSync } from 'fs';
import glob from 'glob';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from './types';
import { resolveToCwd } from './utils/path-utils';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from './utils/truncate';

const globInputSchema = z.object({
  pattern: z.string().describe("Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'"),
  path: z.string().optional().describe('Directory to search in (default: current directory)'),
});

type GlobInput = z.infer<typeof globInputSchema>;

const DEFAULT_LIMIT = 1000;

export const globTool: Tool<GlobInput> = {
  name: 'Glob',
  description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
  inputSchema: globInputSchema,
  execute: async (input: GlobInput, context: ToolContext): Promise<ToolResult> => {
    const { pattern, path: searchDir } = input;
    const { cwd, signal } = context;

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const searchPath = resolveToCwd(searchDir || '.', cwd);

    if (!existsSync(searchPath)) {
      return { output: `Path not found: ${searchPath}`, isError: true };
    }

    try {
      const results = glob.sync(pattern, {
        cwd: searchPath,
        dot: true,
        absolute: false,
        ignore: ['**/node_modules/**', '**/.git/**'],
        nodir: true,
      });

      if (results.length === 0) {
        return { output: 'No files found matching pattern', isError: false };
      }

      const sorted = results.sort();
      const limited = sorted.slice(0, DEFAULT_LIMIT);
      const resultLimitReached = sorted.length >= DEFAULT_LIMIT;

      const rawOutput = limited.join('\n');
      const truncation = truncateHead(rawOutput, {
        maxLines: Number.MAX_SAFE_INTEGER,
      });

      let resultOutput = truncation.content;
      const notices: string[] = [];

      if (resultLimitReached) {
        notices.push(`${DEFAULT_LIMIT} results limit reached. Refine pattern for more specific results`);
      }

      if (truncation.truncated) {
        notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
      }

      if (notices.length > 0) {
        resultOutput += `\n\n[${notices.join('. ')}]`;
      }

      return { output: resultOutput, isError: false };
    } catch (e) {
      return { output: String(e), isError: true };
    }
  },
};
