import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';
import { mkdir as fsMkdir, writeFile as fsWriteFile } from 'fs/promises';
import { dirname } from 'path';
import { resolveToCwd } from './utils/pathUtils';

const writeSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to write (relative or absolute)' }),
  content: Type.String({ description: 'Content to write to the file' }),
});

export function createWriteTool(cwd: string): AgentTool<typeof writeSchema> {
  return {
    name: 'write',
    label: 'write',
    description:
      'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Automatically creates parent directories.',
    parameters: writeSchema,
    execute: async (
      _toolCallId: string,
      { path, content }: { path: string; content: string },
      signal?: AbortSignal
    ) => {
      const absolutePath = resolveToCwd(path, cwd);
      const dir = dirname(absolutePath);

      return new Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: undefined;
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
            await fsMkdir(dir, { recursive: true });

            if (aborted) return;

            await fsWriteFile(absolutePath, content, 'utf-8');

            if (aborted) return;

            if (signal) {
              signal.removeEventListener('abort', onAbort);
            }

            resolve({
              content: [
                { type: 'text', text: `Successfully wrote ${content.length} bytes to ${path}` },
              ],
              details: undefined,
            });
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
