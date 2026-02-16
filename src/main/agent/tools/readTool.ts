import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ImageContent, TextContent } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import { constants } from 'fs';
import { access as fsAccess, readFile as fsReadFile } from 'fs/promises';
import { resolveReadPath } from './utils/pathUtils';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
} from './utils/truncate';

const readSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to read (relative or absolute)' }),
  offset: Type.Optional(
    Type.Number({ description: 'Line number to start reading from (1-indexed)' })
  ),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read' })),
});

export interface ReadToolDetails {
  truncation?: TruncationResult;
}

export function createReadTool(
  cwd: string
): AgentTool<typeof readSchema, ReadToolDetails | undefined> {
  return {
    name: 'read',
    label: 'read',
    description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
    parameters: readSchema,
    execute: async (
      _toolCallId: string,
      { path, offset, limit }: { path: string; offset?: number; limit?: number },
      signal?: AbortSignal
    ) => {
      const absolutePath = resolveReadPath(path, cwd);

      return new Promise<{
        content: (TextContent | ImageContent)[];
        details: ReadToolDetails | undefined;
      }>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('Operation aborted'));
          return;
        }

        let aborted = false;
        const onAbort = () => {
          aborted = true;
          reject(new Error('Operation aborted'));
        };

        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }

        (async () => {
          try {
            await fsAccess(absolutePath, constants.R_OK);

            if (aborted) return;

            // Check if it's an image by extension
            const ext = absolutePath.toLowerCase().split('.').pop();
            const imageMimeTypes: Record<string, string> = {
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              png: 'image/png',
              gif: 'image/gif',
              webp: 'image/webp',
            };
            const mimeType = ext ? imageMimeTypes[ext] : undefined;

            let content: (TextContent | ImageContent)[];
            let details: ReadToolDetails | undefined;

            if (mimeType) {
              const buffer = await fsReadFile(absolutePath);
              const base64 = buffer.toString('base64');
              const textNote = `Read image file [${mimeType}]`;
              content = [
                { type: 'text', text: textNote },
                { type: 'image', data: base64, mimeType },
              ];
            } else {
              const buffer = await fsReadFile(absolutePath);
              const textContent = buffer.toString('utf-8');
              const allLines = textContent.split('\n');
              const totalFileLines = allLines.length;

              const startLine = offset ? Math.max(0, offset - 1) : 0;
              const startLineDisplay = startLine + 1;

              if (startLine >= allLines.length) {
                throw new Error(
                  `Offset ${offset} is beyond end of file (${allLines.length} lines total)`
                );
              }

              let selectedContent: string;
              let userLimitedLines: number | undefined;
              if (limit !== undefined) {
                const endLine = Math.min(startLine + limit, allLines.length);
                selectedContent = allLines.slice(startLine, endLine).join('\n');
                userLimitedLines = endLine - startLine;
              } else {
                selectedContent = allLines.slice(startLine).join('\n');
              }

              const truncation = truncateHead(selectedContent);

              let outputText: string;

              if (truncation.firstLineExceedsLimit) {
                const firstLineSize = formatSize(
                  Buffer.byteLength(allLines[startLine], 'utf-8')
                );
                outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
                details = { truncation };
              } else if (truncation.truncated) {
                const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
                const nextOffset = endLineDisplay + 1;

                outputText = truncation.content;

                if (truncation.truncatedBy === 'lines') {
                  outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
                } else {
                  outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
                }
                details = { truncation };
              } else if (
                userLimitedLines !== undefined &&
                startLine + userLimitedLines < allLines.length
              ) {
                const remaining = allLines.length - (startLine + userLimitedLines);
                const nextOffset = startLine + userLimitedLines + 1;

                outputText = truncation.content;
                outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
              } else {
                outputText = truncation.content;
              }

              content = [{ type: 'text', text: outputText }];
            }

            if (aborted) return;

            if (signal) {
              signal.removeEventListener('abort', onAbort);
            }

            resolve({ content, details });
          } catch (error: any) {
            if (signal) {
              signal.removeEventListener('abort', onAbort);
            }
            if (!aborted) {
              reject(error);
            }
          }
        })();
      });
    },
  };
}
