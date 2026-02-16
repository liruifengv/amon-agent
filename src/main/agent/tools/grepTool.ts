import { createInterface } from 'node:readline';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';
import { spawn, spawnSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { resolveToCwd } from './utils/pathUtils';
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  GREP_MAX_LINE_LENGTH,
  type TruncationResult,
  truncateHead,
  truncateLine,
} from './utils/truncate';

const grepSchema = Type.Object({
  pattern: Type.String({ description: 'Search pattern (regex or literal string)' }),
  path: Type.Optional(
    Type.String({
      description: 'Directory or file to search (default: current directory)',
    })
  ),
  glob: Type.Optional(
    Type.String({
      description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'",
    })
  ),
  ignoreCase: Type.Optional(
    Type.Boolean({ description: 'Case-insensitive search (default: false)' })
  ),
  literal: Type.Optional(
    Type.Boolean({
      description: 'Treat pattern as literal string instead of regex (default: false)',
    })
  ),
  context: Type.Optional(
    Type.Number({
      description: 'Number of lines to show before and after each match (default: 0)',
    })
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Maximum number of matches to return (default: 100)' })
  ),
});

const DEFAULT_LIMIT = 100;

export interface GrepToolDetails {
  truncation?: TruncationResult;
  matchLimitReached?: number;
  linesTruncated?: boolean;
}

/**
 * Find ripgrep binary. Checks system PATH first.
 */
function findRipgrep(): string | null {
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';

  // Check if rg is available on PATH
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

export function createGrepTool(
  cwd: string
): AgentTool<typeof grepSchema, GrepToolDetails | undefined> {
  return {
    name: 'grep',
    label: 'grep',
    description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
    parameters: grepSchema,
    execute: async (
      _toolCallId: string,
      {
        pattern,
        path: searchDir,
        glob,
        ignoreCase,
        literal,
        context,
        limit,
      }: {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
        literal?: boolean;
        context?: number;
        limit?: number;
      },
      signal?: AbortSignal
    ) => {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('Operation aborted'));
          return;
        }

        let settled = false;
        const settle = (fn: () => void) => {
          if (!settled) {
            settled = true;
            fn();
          }
        };

        (async () => {
          try {
            const rgPath = findRipgrep();
            if (!rgPath) {
              settle(() =>
                reject(
                  new Error(
                    'ripgrep (rg) is not available. Please install ripgrep to use the grep tool.'
                  )
                )
              );
              return;
            }

            const searchPath = resolveToCwd(searchDir || '.', cwd);
            const contextValue = context && context > 0 ? context : 0;
            const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);

            let isDirectory: boolean;
            try {
              isDirectory = statSync(searchPath).isDirectory();
            } catch {
              settle(() => reject(new Error(`Path not found: ${searchPath}`)));
              return;
            }

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

            if (ignoreCase) {
              args.push('--ignore-case');
            }

            if (literal) {
              args.push('--fixed-strings');
            }

            if (glob) {
              args.push('--glob', glob);
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

            const stopChild = (dueToLimit: boolean = false) => {
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
              if (!line.trim() || matchCount >= effectiveLimit) {
                return;
              }

              let event: any;
              try {
                event = JSON.parse(line);
              } catch {
                return;
              }

              if (event.type === 'match') {
                matchCount++;
                const filePath = event.data?.path?.text;
                const lineNumber = event.data?.line_number;

                if (filePath && typeof lineNumber === 'number') {
                  matches.push({ filePath, lineNumber });
                }

                if (matchCount >= effectiveLimit) {
                  matchLimitReached = true;
                  stopChild(true);
                }
              }
            });

            child.on('error', (error: Error) => {
              cleanup();
              settle(() =>
                reject(new Error(`Failed to run ripgrep: ${error.message}`))
              );
            });

            child.on('close', (code: number | null) => {
              cleanup();

              if (aborted) {
                settle(() => reject(new Error('Operation aborted')));
                return;
              }

              if (!killedDueToLimit && code !== 0 && code !== 1) {
                const errorMsg =
                  stderr.trim() || `ripgrep exited with code ${code}`;
                settle(() => reject(new Error(errorMsg)));
                return;
              }

              if (matchCount === 0) {
                settle(() =>
                  resolve({
                    content: [{ type: 'text', text: 'No matches found' }],
                    details: undefined,
                  })
                );
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

                const start =
                  contextValue > 0
                    ? Math.max(1, match.lineNumber - contextValue)
                    : match.lineNumber;
                const end =
                  contextValue > 0
                    ? Math.min(lines.length, match.lineNumber + contextValue)
                    : match.lineNumber;

                for (let current = start; current <= end; current++) {
                  const lineText = lines[current - 1] ?? '';
                  const sanitized = lineText.replace(/\r/g, '');
                  const isMatchLine = current === match.lineNumber;

                  const { text: truncatedText, wasTruncated } =
                    truncateLine(sanitized);
                  if (wasTruncated) {
                    linesTruncated = true;
                  }

                  if (isMatchLine) {
                    outputLines.push(
                      `${relativePath}:${current}: ${truncatedText}`
                    );
                  } else {
                    outputLines.push(
                      `${relativePath}-${current}- ${truncatedText}`
                    );
                  }
                }
              }

              const rawOutput = outputLines.join('\n');
              const truncation = truncateHead(rawOutput, {
                maxLines: Number.MAX_SAFE_INTEGER,
              });

              let output = truncation.content;
              const details: GrepToolDetails = {};
              const notices: string[] = [];

              if (matchLimitReached) {
                notices.push(
                  `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`
                );
                details.matchLimitReached = effectiveLimit;
              }

              if (truncation.truncated) {
                notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
                details.truncation = truncation;
              }

              if (linesTruncated) {
                notices.push(
                  `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`
                );
                details.linesTruncated = true;
              }

              if (notices.length > 0) {
                output += `\n\n[${notices.join('. ')}]`;
              }

              settle(() =>
                resolve({
                  content: [{ type: 'text', text: output }],
                  details:
                    Object.keys(details).length > 0 ? details : undefined,
                })
              );
            });
          } catch (err) {
            settle(() => reject(err as Error));
          }
        })();
      });
    },
  };
}
