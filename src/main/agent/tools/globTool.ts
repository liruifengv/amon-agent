import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';
import { existsSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { resolveToCwd } from './utils/pathUtils';
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from './utils/truncate';

const globSchema = Type.Object({
  pattern: Type.String({
    description:
      "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'",
  }),
  path: Type.Optional(
    Type.String({ description: 'Directory to search in (default: current directory)' })
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Maximum number of results (default: 1000)' })
  ),
});

const DEFAULT_LIMIT = 1000;

export interface GlobToolDetails {
  truncation?: TruncationResult;
  resultLimitReached?: number;
}

export function createGlobTool(
  cwd: string
): AgentTool<typeof globSchema, GlobToolDetails | undefined> {
  return {
    name: 'glob',
    label: 'glob',
    description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
    parameters: globSchema,
    execute: async (
      _toolCallId: string,
      {
        pattern,
        path: searchDir,
        limit,
      }: { pattern: string; path?: string; limit?: number },
      signal?: AbortSignal
    ) => {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('Operation aborted'));
          return;
        }

        const onAbort = () => reject(new Error('Operation aborted'));
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
          const searchPath = resolveToCwd(searchDir || '.', cwd);
          const effectiveLimit = limit ?? DEFAULT_LIMIT;

          if (!existsSync(searchPath)) {
            signal?.removeEventListener('abort', onAbort);
            reject(new Error(`Path not found: ${searchPath}`));
            return;
          }

          // Use Node.js glob (synchronous for simplicity in Electron main process)
          const results = globSync(pattern, {
            cwd: searchPath,
            dot: true,
            absolute: false,
            ignore: ['**/node_modules/**', '**/.git/**'],
            nodir: true,
          });

          signal?.removeEventListener('abort', onAbort);

          if (results.length === 0) {
            resolve({
              content: [{ type: 'text', text: 'No files found matching pattern' }],
              details: undefined,
            });
            return;
          }

          // Sort and limit results
          const sorted = results.sort();
          const limited = sorted.slice(0, effectiveLimit);
          const resultLimitReached = sorted.length >= effectiveLimit;

          const rawOutput = limited.join('\n');
          const truncation = truncateHead(rawOutput, {
            maxLines: Number.MAX_SAFE_INTEGER,
          });

          let resultOutput = truncation.content;
          const details: GlobToolDetails = {};
          const notices: string[] = [];

          if (resultLimitReached) {
            notices.push(
              `${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`
            );
            details.resultLimitReached = effectiveLimit;
          }

          if (truncation.truncated) {
            notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
            details.truncation = truncation;
          }

          if (notices.length > 0) {
            resultOutput += `\n\n[${notices.join('. ')}]`;
          }

          resolve({
            content: [{ type: 'text', text: resultOutput }],
            details: Object.keys(details).length > 0 ? details : undefined,
          });
        } catch (e: any) {
          signal?.removeEventListener('abort', onAbort);
          reject(e);
        }
      });
    },
  };
}
