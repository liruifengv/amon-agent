import { constants } from 'fs';
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from './types';
import {
  detectLineEnding,
  fuzzyFindText,
  generateDiffString,
  normalizeForFuzzyMatch,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from './utils/edit-diff';
import { resolveToCwd } from './utils/path-utils';

const editInputSchema = z.object({
  file_path: z.string().describe('Path to the file to edit (relative or absolute)'),
  old_string: z.string().describe('Exact text to find and replace (must match exactly)'),
  new_string: z.string().describe('New text to replace the old text with'),
  replace_all: z.boolean().default(false).describe('Replace all occurrences (default: false)'),
});

type EditInput = z.infer<typeof editInputSchema>;

export const editTool: Tool<EditInput> = {
  name: 'Edit',
  description:
    'Edit a file by replacing exact text. The old_string must match exactly (including whitespace). Use this for precise, surgical edits.',
  inputSchema: editInputSchema,
  execute: async (input: EditInput, context: ToolContext): Promise<ToolResult> => {
    const { file_path, old_string, new_string, replace_all } = input;
    const { cwd, signal } = context;

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const absolutePath = resolveToCwd(file_path, cwd);

    try {
      await fsAccess(absolutePath, constants.R_OK | constants.W_OK);
    } catch {
      return { output: `File not found: ${file_path}`, isError: true };
    }

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const buffer = await fsReadFile(absolutePath);
    const rawContent = buffer.toString('utf-8');

    const { bom, text: content } = stripBom(rawContent);
    const originalEnding = detectLineEnding(content);
    const normalizedContent = normalizeToLF(content);
    const normalizedOldText = normalizeToLF(old_string);
    const normalizedNewText = normalizeToLF(new_string);

    if (replace_all) {
      // Replace all occurrences
      if (!normalizedContent.includes(normalizedOldText)) {
        // Try fuzzy match for error message
        const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
        const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
        if (!fuzzyContent.includes(fuzzyOldText)) {
          return {
            output: `Could not find the text in ${file_path}. The old_string must match exactly including all whitespace and newlines.`,
            isError: true,
          };
        }
      }

      const newContent = normalizedContent.split(normalizedOldText).join(normalizedNewText);

      if (normalizedContent === newContent) {
        return {
          output: `No changes made to ${file_path}. The replacement produced identical content.`,
          isError: true,
        };
      }

      const finalContent = bom + restoreLineEndings(newContent, originalEnding);
      await fsWriteFile(absolutePath, finalContent, 'utf-8');

      const diffResult = generateDiffString(normalizedContent, newContent);
      return {
        output: `Successfully replaced all occurrences in ${file_path}.\n\n${diffResult.diff}`,
        isError: false,
      };
    }

    // Single replacement (default)
    const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

    if (!matchResult.found) {
      return {
        output: `Could not find the exact text in ${file_path}. The old_string must match exactly including all whitespace and newlines.`,
        isError: true,
      };
    }

    const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
    const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
    const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;

    if (occurrences > 1) {
      return {
        output: `Found ${occurrences} occurrences of the text in ${file_path}. The text must be unique. Please provide more context to make it unique, or use replace_all=true.`,
        isError: true,
      };
    }

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    const baseContent = matchResult.contentForReplacement;
    const newContent =
      baseContent.substring(0, matchResult.index) +
      normalizedNewText +
      baseContent.substring(matchResult.index + matchResult.matchLength);

    if (baseContent === newContent) {
      return {
        output: `No changes made to ${file_path}. The replacement produced identical content.`,
        isError: true,
      };
    }

    const finalContent = bom + restoreLineEndings(newContent, originalEnding);
    await fsWriteFile(absolutePath, finalContent, 'utf-8');

    const diffResult = generateDiffString(baseContent, newContent);
    return {
      output: `Successfully replaced text in ${file_path}.\n\n${diffResult.diff}`,
      isError: false,
    };
  },
};
