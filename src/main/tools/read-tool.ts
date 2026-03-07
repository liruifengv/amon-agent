import { constants } from 'fs';
import { access as fsAccess, readFile as fsReadFile } from 'fs/promises';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from './types';
import { resolveReadPath } from './utils/path-utils';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from './utils/truncate';

const readInputSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
  limit: z.number().optional().describe('Maximum number of lines to read'),
});

type ReadInput = z.infer<typeof readInputSchema>;

export const readTool: Tool<ReadInput> = {
  name: 'Read',
  description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
  inputSchema: readInputSchema,
  execute: async (input: ReadInput, context: ToolContext): Promise<ToolResult> => {
    const { file_path, offset, limit } = input;
    const { cwd, signal } = context;

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const absolutePath = resolveReadPath(file_path, cwd);

    try {
      await fsAccess(absolutePath, constants.R_OK);
    } catch {
      return { output: `File not found or not readable: ${file_path}`, isError: true };
    }

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    // Check if it's an image by extension
    const ext = absolutePath.toLowerCase().split('.').pop();
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

    if (ext && imageExts.has(ext)) {
      const buffer = await fsReadFile(absolutePath);
      const base64 = buffer.toString('base64');
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return {
        output: `Read image file [${mimeType}], base64 length: ${base64.length}`,
        isError: false,
      };
    }

    // Text file
    const buffer = await fsReadFile(absolutePath);
    const textContent = buffer.toString('utf-8');
    const allLines = textContent.split('\n');
    const totalFileLines = allLines.length;

    const startLine = offset ? Math.max(0, offset - 1) : 0;
    const startLineDisplay = startLine + 1;

    if (startLine >= allLines.length) {
      return {
        output: `Offset ${offset} is beyond end of file (${allLines.length} lines total)`,
        isError: true,
      };
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
      outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${file_path} | head -c ${DEFAULT_MAX_BYTES}]`;
    } else if (truncation.truncated) {
      const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
      const nextOffset = endLineDisplay + 1;

      outputText = truncation.content;

      if (truncation.truncatedBy === 'lines') {
        outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
      } else {
        outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
      }
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

    return { output: outputText, isError: false };
  },
};
