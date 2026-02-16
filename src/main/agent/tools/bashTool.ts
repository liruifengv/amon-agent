import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';
import { spawn } from 'child_process';
import { buildEnhancedPath } from '../../runtime/bundledPaths';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateTail,
} from './utils/truncate';

function getTempFilePath(): string {
  const id = randomBytes(8).toString('hex');
  return join(tmpdir(), `amon-bash-${id}.log`);
}

const bashSchema = Type.Object({
  command: Type.String({ description: 'Bash command to execute' }),
  timeout: Type.Optional(
    Type.Number({ description: 'Timeout in seconds (optional, no default timeout)' })
  ),
});

export interface BashToolDetails {
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

function getShellConfig(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    // Try Git Bash in known locations
    const programFiles = process.env.ProgramFiles;
    if (programFiles) {
      const gitBash = `${programFiles}\\Git\\bin\\bash.exe`;
      if (existsSync(gitBash)) {
        return { shell: gitBash, args: ['-c'] };
      }
    }
    // Fallback to cmd
    return { shell: 'cmd.exe', args: ['/c'] };
  }

  if (existsSync('/bin/bash')) {
    return { shell: '/bin/bash', args: ['-c'] };
  }

  return { shell: 'sh', args: ['-c'] };
}

function getShellEnv(): NodeJS.ProcessEnv {
  try {
    const enhancedPath = buildEnhancedPath();
    return { ...process.env, PATH: enhancedPath };
  } catch {
    // buildEnhancedPath may fail in some environments (e.g., missing Electron app context)
    return { ...process.env };
  }
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        detached: true,
      });
    } catch {
      // Ignore
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process already dead
      }
    }
  }
}

export function createBashTool(
  cwd: string
): AgentTool<typeof bashSchema, BashToolDetails | undefined> {
  return {
    name: 'bash',
    label: 'bash',
    description: `Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`,
    parameters: bashSchema,
    execute: async (
      _toolCallId: string,
      { command, timeout }: { command: string; timeout?: number },
      signal?: AbortSignal,
      onUpdate?
    ) => {
      return new Promise((resolve, reject) => {
        const { shell, args } = getShellConfig();
        const env = getShellEnv();

        if (!existsSync(cwd)) {
          reject(new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
          return;
        }

        const child = spawn(shell, [...args, command], {
          cwd,
          detached: true,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let timedOut = false;
        let tempFilePath: string | undefined;
        let tempFileStream: ReturnType<typeof createWriteStream> | undefined;
        let totalBytes = 0;

        const chunks: Buffer[] = [];
        let chunksBytes = 0;
        const maxChunksBytes = DEFAULT_MAX_BYTES * 2;

        let timeoutHandle: NodeJS.Timeout | undefined;
        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              killProcessTree(child.pid);
            }
          }, timeout * 1000);
        }

        const handleData = (data: Buffer) => {
          totalBytes += data.length;

          if (totalBytes > DEFAULT_MAX_BYTES && !tempFilePath) {
            tempFilePath = getTempFilePath();
            tempFileStream = createWriteStream(tempFilePath);
            for (const chunk of chunks) {
              tempFileStream.write(chunk);
            }
          }

          if (tempFileStream) {
            tempFileStream.write(data);
          }

          chunks.push(data);
          chunksBytes += data.length;

          while (chunksBytes > maxChunksBytes && chunks.length > 1) {
            const removed = chunks.shift()!;
            chunksBytes -= removed.length;
          }

          if (onUpdate) {
            const fullBuffer = Buffer.concat(chunks);
            const fullText = fullBuffer.toString('utf-8');
            const truncation = truncateTail(fullText);
            onUpdate({
              content: [{ type: 'text', text: truncation.content || '' }],
              details: {
                truncation: truncation.truncated ? truncation : undefined,
                fullOutputPath: tempFilePath,
              },
            });
          }
        };

        if (child.stdout) {
          child.stdout.on('data', handleData);
        }
        if (child.stderr) {
          child.stderr.on('data', handleData);
        }

        const onAbort = () => {
          if (child.pid) {
            killProcessTree(child.pid);
          }
        };

        if (signal) {
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener('abort', onAbort, { once: true });
          }
        }

        child.on('error', (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(err);
        });

        child.on('close', (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (signal) signal.removeEventListener('abort', onAbort);

          if (tempFileStream) {
            tempFileStream.end();
          }

          if (signal?.aborted) {
            const fullBuffer = Buffer.concat(chunks);
            let output = fullBuffer.toString('utf-8');
            if (output) output += '\n\n';
            output += 'Command aborted';
            reject(new Error(output));
            return;
          }

          if (timedOut) {
            const fullBuffer = Buffer.concat(chunks);
            let output = fullBuffer.toString('utf-8');
            if (output) output += '\n\n';
            output += `Command timed out after ${timeout} seconds`;
            reject(new Error(output));
            return;
          }

          const fullBuffer = Buffer.concat(chunks);
          const fullOutput = fullBuffer.toString('utf-8');
          const truncation = truncateTail(fullOutput);
          let outputText = truncation.content || '(no output)';

          let details: BashToolDetails | undefined;

          if (truncation.truncated) {
            details = { truncation, fullOutputPath: tempFilePath };

            const startLine = truncation.totalLines - truncation.outputLines + 1;
            const endLine = truncation.totalLines;

            if (truncation.lastLinePartial) {
              const lastLineSize = formatSize(
                Buffer.byteLength(fullOutput.split('\n').pop() || '', 'utf-8')
              );
              outputText += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}). Full output: ${tempFilePath}]`;
            } else if (truncation.truncatedBy === 'lines') {
              outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${tempFilePath}]`;
            } else {
              outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${tempFilePath}]`;
            }
          }

          if (code !== 0 && code !== null) {
            outputText += `\n\nCommand exited with code ${code}`;
            reject(new Error(outputText));
          } else {
            resolve({ content: [{ type: 'text', text: outputText }], details });
          }
        });
      });
    },
  };
}
