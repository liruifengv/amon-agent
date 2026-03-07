import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from './types';
import { resolveToCwd } from './utils/path-utils';
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  GREP_MAX_LINE_LENGTH,
  truncateHead,
  truncateLine,
} from './utils/truncate';

const grepInputSchema = z.object({
  pattern: z.string().describe('Search pattern (regex or literal string)'),
  path: z.string().optional().describe('Directory or file to search (default: current directory)'),
  include: z.string().optional().describe("Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'"),
});

type GrepInput = z.infer<typeof grepInputSchema>;

const DEFAULT_LIMIT = 100;

/**
 * Find ripgrep binary. Checks system PATH first.
 */
function findRipgrep(): string | null {
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';

  try {
    const result = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [binaryName],
      { encoding: 'utf-8', timeout: 5000 }
    );
    if (result.status === 0 && result.stdout) {
      const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
      if (firstMatch) return firstMatch;
    }
  } catch {
    // Ignore
  }

  return null;
}

export const grepTool: Tool<GrepInput> = {
  name: 'Grep',
  description: `Search file contents for a pattern using ripgrep. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
  inputSchema: grepInputSchema,
  execute: async (input: GrepInput, context: ToolContext): Promise<ToolResult> => {
    const { pattern, path: searchDir, include } = input;
    const { cwd, signal } = context;

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const rgPath = findRipgrep();
    if (!rgPath) {
      return {
        output: 'ripgrep (rg) is not available. Please install ripgrep to use the grep tool.',
        isError: true,
      };
    }

    const searchPath = resolveToCwd(searchDir || '.', cwd);

    let isDirectory: boolean;
    try {
      isDirectory = statSync(searchPath).isDirectory();
    } catch {
      return { output: `Path not found: ${searchPath}`, isError: true };
    }

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: ToolResult) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      const formatPath = (filePath: string): string => {
        if (isDirectory) {
          const relative = path.relative(searchPath, filePath);
          if (relative && !relative.startsWith('..')) {
            return relative.replace(/\\/g, '/');
          }
        }
        return path.basename(filePath);
      };

      const fileCache = new Map<string, string[]>();
      const getFileLines = (filePath: string): string[] => {
        let lines = fileCache.get(filePath);
        if (!lines) {
          try {
            const content = readFileSync(filePath, 'utf-8');
            lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
          } catch {
            lines = [];
          }
          fileCache.set(filePath, lines);
        }
        return lines;
      };

      const args: string[] = [
        '--json',
        '--line-number',
        '--color=never',
        '--hidden',
      ];

      if (include) {
        args.push('--glob', include);
      }

      args.push(pattern, searchPath);

      const child = spawn(rgPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const rl = createInterface({ input: child.stdout });
      let stderr = '';
      let matchCount = 0;
      let matchLimitReached = false;
      let linesTruncated = false;
      let aborted = false;
      let killedDueToLimit = false;
      const outputLines: string[] = [];

      const cleanup = () => {
        rl.close();
        signal?.removeEventListener('abort', onAbort);
      };

      const stopChild = (dueToLimit = false) => {
        if (!child.killed) {
          killedDueToLimit = dueToLimit;
          child.kill();
        }
      };

      const onAbort = () => {
        aborted = true;
        stopChild();
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const matches: Array<{ filePath: string; lineNumber: number }> = [];

      rl.on('line', (line: string) => {
        if (!line.trim() || matchCount >= DEFAULT_LIMIT) {
          return;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === 'match') {
          matchCount++;
          const data = event.data as Record<string, unknown> | undefined;
          const pathObj = data?.path as Record<string, unknown> | undefined;
          const filePath = pathObj?.text as string | undefined;
          const lineNumber = data?.line_number;

          if (filePath && typeof lineNumber === 'number') {
            matches.push({ filePath, lineNumber });
          }

          if (matchCount >= DEFAULT_LIMIT) {
            matchLimitReached = true;
            stopChild(true);
          }
        }
      });

      child.on('error', (error: Error) => {
        cleanup();
        settle({ output: `Failed to run ripgrep: ${error.message}`, isError: true });
      });

      child.on('close', (code: number | null) => {
        cleanup();

        if (aborted) {
          settle({ output: 'Operation aborted', isError: true });
          return;
        }

        if (!killedDueToLimit && code !== 0 && code !== 1) {
          const errorMsg = stderr.trim() || `ripgrep exited with code ${code}`;
          settle({ output: errorMsg, isError: true });
          return;
        }

        if (matchCount === 0) {
          settle({ output: 'No matches found', isError: false });
          return;
        }

        // Format matches
        for (const match of matches) {
          const relativePath = formatPath(match.filePath);
          const lines = getFileLines(match.filePath);

          if (!lines.length) {
            outputLines.push(
              `${relativePath}:${match.lineNumber}: (unable to read file)`
            );
            continue;
          }

          const lineText = lines[match.lineNumber - 1] ?? '';
          const sanitized = lineText.replace(/\r/g, '');

          const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
          if (wasTruncated) {
            linesTruncated = true;
          }

          outputLines.push(`${relativePath}:${match.lineNumber}: ${truncatedText}`);
        }

        const rawOutput = outputLines.join('\n');
        const truncation = truncateHead(rawOutput, {
          maxLines: Number.MAX_SAFE_INTEGER,
        });

        let output = truncation.content;
        const notices: string[] = [];

        if (matchLimitReached) {
          notices.push(
            `${DEFAULT_LIMIT} matches limit reached. Refine pattern for more specific results`
          );
        }

        if (truncation.truncated) {
          notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
        }

        if (linesTruncated) {
          notices.push(
            `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`
          );
        }

        if (notices.length > 0) {
          output += `\n\n[${notices.join('. ')}]`;
        }

        settle({ output, isError: false });
      });
    });
  },
};
