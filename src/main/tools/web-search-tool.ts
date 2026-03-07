import { z } from 'zod';
import Exa from 'exa-js';
import type { Tool, ToolContext, ToolResult } from './types';

const DEFAULT_TIMEOUT = 25_000; // 25s

const webSearchInputSchema = z.object({
  query: z.string().describe('The search query to use'),
  type: z
    .enum(['auto', 'keyword', 'neural'])
    .default('auto')
    .describe('Search type: auto (default), keyword, or neural'),
  numResults: z
    .number()
    .default(8)
    .describe('Number of results to return (default 8)'),
});

type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export interface ConfigStoreLike {
  getSettings(): Promise<{ agent: { exaApiKey?: string } }>;
}

/**
 * Create a WebSearch tool backed by Exa AI.
 * Uses closure injection to access configStore without modifying ToolContext.
 */
export function createWebSearchTool(configStore: ConfigStoreLike): Tool<WebSearchInput> {
  return {
    name: 'WebSearch',
    description:
      'Search the web using Exa AI and return relevant results. ' +
      'Requires an Exa API Key configured in Settings > Agent. ' +
      'Returns titles, URLs, and snippets for each result.' +
      'After using a WebSearch tool, attach the source url at the end of your answer.',
    inputSchema: webSearchInputSchema,

    execute: async (input: WebSearchInput, context: ToolContext): Promise<ToolResult> => {
      const { signal } = context;

      if (signal?.aborted) {
        return { output: 'Operation aborted', isError: true };
      }

      const settings = await configStore.getSettings();
      const apiKey = settings.agent.exaApiKey;
      if (!apiKey) {
        return {
          output: 'Exa API Key not configured. Please add it in Settings > Agent.',
          isError: true,
        };
      }

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT);
      const onExternalAbort = () => ac.abort();
      signal?.addEventListener('abort', onExternalAbort);

      try {
        const exa = new Exa(apiKey);
        const result = await exa.search(input.query, {
          type: input.type,
          numResults: input.numResults,
        });

        if (!result.results || result.results.length === 0) {
          return { output: 'No results found.', isError: false };
        }

        const lines = result.results.map((r, i) =>
          `${i + 1}. ${r.title || '(no title)'}\n   ${r.url}`,
        );
        return { output: lines.join('\n\n'), isError: false };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { output: `Search timed out after ${DEFAULT_TIMEOUT / 1000}s`, isError: true };
        }
        return { output: `Search failed: ${String(err)}`, isError: true };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}
