import { z } from 'zod';
import TurndownService from 'turndown';
import type { Tool, ToolContext, ToolResult } from './types';
import { truncateHead, formatSize, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from './utils/truncate';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30_000; // 30s
const MAX_TIMEOUT = 120_000; // 2min

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const webFetchInputSchema = z.object({
  url: z.string().describe('The URL to fetch content from (must start with http:// or https://)'),
  format: z
    .enum(['markdown', 'text', 'html'])
    .default('markdown')
    .describe('Output format: markdown (default), text, or html'),
  timeout: z
    .number()
    .optional()
    .describe('Optional timeout in seconds (max 120)'),
});

type WebFetchInput = z.infer<typeof webFetchInputSchema>;

/**
 * Strip HTML tags and extract plain text using regex.
 * Removes script/style content first, then strips remaining tags.
 */
function extractTextFromHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert HTML to Markdown using TurndownService.
 */
function convertHTMLToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  td.remove(['script', 'style', 'meta', 'link', 'noscript']);
  return td.turndown(html);
}

/**
 * Build Accept header based on requested format.
 */
function buildAcceptHeader(format: string): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
    case 'text':
      return 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
    case 'html':
      return 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1';
    default:
      return '*/*';
  }
}

export const webFetchTool: Tool<WebFetchInput> = {
  name: 'WebFetch',
  description:
    'Fetch content from a URL and return it as markdown, text, or html. ' +
    `Output is truncated to ${DEFAULT_MAX_LINES} lines / ${formatSize(DEFAULT_MAX_BYTES)}. ` +
    'Use for retrieving web pages, API docs, or any publicly accessible content.',
  inputSchema: webFetchInputSchema,

  execute: async (input: WebFetchInput, context: ToolContext): Promise<ToolResult> => {
    const { url, format, timeout: timeoutSec } = input;
    const { signal } = context;

    if (signal?.aborted) {
      return { output: 'Operation aborted', isError: true };
    }

    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { output: 'URL must start with http:// or https://', isError: true };
    }

    const timeoutMs = Math.min(
      timeoutSec ? timeoutSec * 1000 : DEFAULT_TIMEOUT,
      MAX_TIMEOUT,
    );

    // Create an abort controller that combines timeout + external signal
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onExternalAbort = () => ac.abort();
    signal?.addEventListener('abort', onExternalAbort);

    try {
      const headers = {
        'User-Agent': CHROME_UA,
        'Accept': buildAcceptHeader(format),
        'Accept-Language': 'en-US,en;q=0.9',
      };

      let response = await fetch(url, { signal: ac.signal, headers });

      // Retry with honest UA if Cloudflare blocks (TLS fingerprint mismatch)
      if (response.status === 403 && response.headers.get('cf-mitigated') === 'challenge') {
        response = await fetch(url, {
          signal: ac.signal,
          headers: { ...headers, 'User-Agent': 'amon-agent' },
        });
      }

      if (!response.ok) {
        return { output: `Request failed: HTTP ${response.status}`, isError: true };
      }

      // Check response size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        return { output: `Response too large (${formatSize(parseInt(contentLength))}, limit ${formatSize(MAX_RESPONSE_SIZE)})`, isError: true };
      }

      const buf = await response.arrayBuffer();
      if (buf.byteLength > MAX_RESPONSE_SIZE) {
        return { output: `Response too large (${formatSize(buf.byteLength)}, limit ${formatSize(MAX_RESPONSE_SIZE)})`, isError: true };
      }

      const raw = new TextDecoder().decode(buf);
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

      // Convert content based on format + content-type
      let content: string;
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        content = format === 'html' ? raw
          : format === 'text' ? extractTextFromHTML(raw)
          : convertHTMLToMarkdown(raw);
      } else {
        // Already plain text, markdown, json, etc. — return as-is
        content = raw;
      }

      // Truncate
      const result = truncateHead(content);
      let output = result.content;
      if (result.truncated) {
        output += `\n\n[Content truncated: showing ${result.outputLines} of ${result.totalLines} lines (${formatSize(result.outputBytes)} of ${formatSize(result.totalBytes)})]`;
      }

      return { output: `${url}\n\n${output}`, isError: false };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { output: `Request timed out after ${timeoutMs / 1000}s`, isError: true };
      }
      return { output: `Fetch failed: ${String(err)}`, isError: true };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  },
};
