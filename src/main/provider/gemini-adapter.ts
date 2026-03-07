import { GoogleGenAI } from '@google/genai';
import type {
  Content,
  FunctionDeclaration,
  GenerateContentResponse,
  Part,
  Tool,
} from '@google/genai';
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderMessage,
  ProviderToolDef,
  ProviderUserContent,
  ProviderAssistantContent,
  NormalizedStreamEvent,
} from '@shared/provider-types';
import type { StopReason } from '@shared/types';
import {
  THINKING_LEVEL_TO_GEMINI,
  filterBlockedHeaders,
} from '@shared/constants';

// ---------------------------------------------------------------------------
// Message conversion: ProviderMessage[] -> Gemini Content[]
// ---------------------------------------------------------------------------

function toGeminiContents(messages: ProviderMessage[]): Content[] {
  const result: Content[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const parts: Part[] = [];

      for (const block of msg.content) {
        switch ((block as ProviderUserContent).type) {
          case 'text':
            parts.push({ text: (block as Extract<ProviderUserContent, { type: 'text' }>).text });
            break;
          case 'image': {
            const img = block as Extract<ProviderUserContent, { type: 'image' }>;
            parts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data,
              },
            });
            break;
          }
          case 'tool_result': {
            const tr = block as Extract<ProviderUserContent, { type: 'tool_result' }>;
            parts.push({
              functionResponse: {
                id: tr.toolUseId,
                name: tr.toolUseId, // Will be overridden below if we can find the name
                response: { output: tr.output },
              },
            });
            break;
          }
        }
      }

      if (parts.length > 0) {
        result.push({ role: 'user', parts });
      }
    } else {
      // assistant -> model
      const parts: Part[] = [];

      for (const block of msg.content as ProviderAssistantContent[]) {
        switch (block.type) {
          case 'text':
            parts.push({ text: block.text });
            break;
          case 'thinking':
            // Gemini thinking blocks are represented as text parts with thought=true.
            // The thoughtSignature must be preserved and sent back for tool-call turns.
            parts.push({
              text: block.thinking,
              thought: true,
              ...(block.signature ? { thoughtSignature: block.signature } : {}),
            });
            break;
          case 'tool_use':
            parts.push({
              functionCall: {
                id: block.id,
                name: block.name,
                args: block.input as Record<string, unknown>,
              },
              // Gemini requires thoughtSignature on functionCall parts when thinking is enabled.
              ...(block.signature ? { thoughtSignature: block.signature } : {}),
            });
            break;
          case 'server_tool_use':
          case 'server_tool_result':
            // Gemini does not support Anthropic server tools — skip
            break;
        }
      }

      if (parts.length > 0) {
        result.push({ role: 'model', parts });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool conversion: ProviderToolDef[] -> Gemini Tool[]
// ---------------------------------------------------------------------------

function toGeminiTools(tools: ProviderToolDef[]): Tool[] {
  const declarations: FunctionDeclaration[] = tools.map(
    (t): FunctionDeclaration => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: t.inputSchema,
    }),
  );
  return [{ functionDeclarations: declarations }];
}

// ---------------------------------------------------------------------------
// Thinking config builder
// ---------------------------------------------------------------------------

function buildThinkingConfig(request: ProviderRequest): {
  includeThoughts: boolean;
  thinkingLevel?: string;
  thinkingBudget?: number;
} | undefined {
  // Prefer thinkingLevel (direct string mapping for Gemini 3)
  if (request.thinkingLevel && request.thinkingLevel !== 'off') {
    const geminiLevel = THINKING_LEVEL_TO_GEMINI[request.thinkingLevel];
    if (geminiLevel) {
      return { includeThoughts: true, thinkingLevel: geminiLevel };
    }
  }
  // Fallback to thinkingBudget (Gemini 2.5)
  const budget = request.thinkingBudget;
  if (budget && budget > 0) {
    return { includeThoughts: true, thinkingBudget: budget };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapFinishReason(
  finishReason: string | undefined,
  hasFunctionCalls: boolean,
): StopReason {
  // Gemini does not have a dedicated tool_use finish reason.
  // When STOP + function calls present, it means tool_use.
  if (hasFunctionCalls) {
    return 'tool_use';
  }
  switch (finishReason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'OTHER':
    default:
      return 'end_turn';
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GeminiAdapter implements ProviderAdapter {
  readonly id: string;
  private client: GoogleGenAI;

  constructor(apiKey: string, baseUrl?: string, id?: string, customHeaders?: Record<string, string>) {
    this.id = id ?? 'gemini';
    const safeHeaders = filterBlockedHeaders(customHeaders);
    const httpOptions = {
      ...(baseUrl ? { baseUrl } : {}),
      ...(safeHeaders ? { headers: safeHeaders } : {}),
    };
    const opts: ConstructorParameters<typeof GoogleGenAI>[0] = {
      apiKey,
      ...(Object.keys(httpOptions).length > 0 ? { httpOptions } : {}),
    };
    this.client = new GoogleGenAI(opts);
  }

  async *stream(
    request: ProviderRequest,
  ): AsyncGenerator<NormalizedStreamEvent> {
    // Internal state to synthesize normalized block lifecycle events
    let messageStarted = false;
    let nextBlockIndex = 0;

    // Track open blocks: key = type identifier, value = block index
    let currentTextBlockOpen = false;
    let currentTextBlockIndex = -1;
    let currentThinkingBlockOpen = false;
    let currentThinkingBlockIndex = -1;

    // Tool calls: track by functionCall id/name to emit proper start/delta/stop
    const emittedToolBlocks = new Set<string>();

    // Accumulated function calls for stop reason detection
    let hasFunctionCalls = false;

    // Final finish reason
    let finishReason: string | undefined;

    // Usage from final chunk
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const contents = toGeminiContents(request.messages);
      const tools = request.tools?.length ? toGeminiTools(request.tools) : undefined;
      const thinkingConfig = buildThinkingConfig(request);

      const maxTokens = request.maxTokens ?? 16_000;

      const config: Record<string, unknown> = {
        ...(request.systemPrompt ? { systemInstruction: request.systemPrompt } : {}),
        ...(tools ? { tools } : {}),
        ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        ...(thinkingConfig ? { thinkingConfig } : {}),
        ...(request.signal ? { abortSignal: request.signal } : {}),
      };

      // extraParams override (highest priority)
      if (request.extraParams) {
        Object.assign(config, request.extraParams);
      }

      const response = await this.client.models.generateContentStream({
        model: request.model,
        contents,
        config,
      });

      for await (const chunk of response) {
        // Emit message_start on first chunk
        if (!messageStarted) {
          messageStarted = true;
          yield { type: 'message_start' };
        }

        // Extract usage from usageMetadata (typically in final chunk)
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          outputTokens = (chunk.usageMetadata.candidatesTokenCount ?? 0)
            + (chunk.usageMetadata.thoughtsTokenCount ?? 0);
        }

        // Extract finish reason
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) {
          finishReason = candidate.finishReason;
        }

        // Process parts
        const parts = this.extractParts(chunk);
        for (const part of parts) {
          // --- Thinking part ---
          if (part.thought && part.text != null) {
            if (!currentThinkingBlockOpen) {
              // Close text block if open (thinking before text is unlikely, but be safe)
              if (currentTextBlockOpen) {
                currentTextBlockOpen = false;
                yield { type: 'content_block_stop', index: currentTextBlockIndex };
              }
              currentThinkingBlockOpen = true;
              currentThinkingBlockIndex = nextBlockIndex++;
              yield {
                type: 'content_block_start',
                index: currentThinkingBlockIndex,
                block: { type: 'thinking' },
              };
            }
            yield {
              type: 'content_block_delta',
              index: currentThinkingBlockIndex,
              delta: { type: 'thinking_delta', thinking: part.text },
            };
            // Emit thoughtSignature so it is stored and sent back in future turns.
            // Gemini requires this for tool-call conversations with thinking enabled.
            if (part.thoughtSignature) {
              yield {
                type: 'content_block_delta',
                index: currentThinkingBlockIndex,
                delta: { type: 'signature_delta', signature: part.thoughtSignature },
              };
            }
            continue;
          }

          // --- Text part ---
          if (part.text != null && !part.thought) {
            // Close thinking block if open (transition from thinking to text)
            if (currentThinkingBlockOpen) {
              currentThinkingBlockOpen = false;
              yield { type: 'content_block_stop', index: currentThinkingBlockIndex };
            }
            if (!currentTextBlockOpen) {
              currentTextBlockOpen = true;
              currentTextBlockIndex = nextBlockIndex++;
              yield {
                type: 'content_block_start',
                index: currentTextBlockIndex,
                block: { type: 'text' },
              };
            }
            yield {
              type: 'content_block_delta',
              index: currentTextBlockIndex,
              delta: { type: 'text_delta', text: part.text },
            };
            continue;
          }

          // --- Function call part ---
          if (part.functionCall) {
            hasFunctionCalls = true;

            // Close thinking/text blocks if open
            if (currentThinkingBlockOpen) {
              currentThinkingBlockOpen = false;
              yield { type: 'content_block_stop', index: currentThinkingBlockIndex };
            }
            if (currentTextBlockOpen) {
              currentTextBlockOpen = false;
              yield { type: 'content_block_stop', index: currentTextBlockIndex };
            }

            const fc = part.functionCall;
            const toolKey = fc.id ?? fc.name ?? `tool_${nextBlockIndex}`;

            if (!emittedToolBlocks.has(toolKey)) {
              emittedToolBlocks.add(toolKey);
              const blockIndex = nextBlockIndex++;
              yield {
                type: 'content_block_start',
                index: blockIndex,
                block: {
                  type: 'tool_use',
                  id: fc.id ?? toolKey,
                  name: fc.name ?? '',
                },
              };
              // Emit the full input as a single JSON delta
              const argsJson = JSON.stringify(fc.args ?? {});
              yield {
                type: 'content_block_delta',
                index: blockIndex,
                delta: {
                  type: 'input_json_delta',
                  partialJson: argsJson,
                },
              };
              // Emit thoughtSignature attached to the functionCall part.
              // Gemini requires this for multi-turn tool-call conversations with thinking.
              if (part.thoughtSignature) {
                yield {
                  type: 'content_block_delta',
                  index: blockIndex,
                  delta: { type: 'signature_delta', signature: part.thoughtSignature },
                };
              }
              yield { type: 'content_block_stop', index: blockIndex };
            }
            continue;
          }
        }
      }

      // --- Stream finished: close any remaining open blocks ---
      if (currentThinkingBlockOpen) {
        yield { type: 'content_block_stop', index: currentThinkingBlockIndex };
      }
      if (currentTextBlockOpen) {
        yield { type: 'content_block_stop', index: currentTextBlockIndex };
      }

      // Emit message_delta with stop reason and usage
      if (messageStarted) {
        yield {
          type: 'message_delta',
          stopReason: mapFinishReason(finishReason, hasFunctionCalls),
          usage: {
            inputTokens,
            outputTokens,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        };
        yield { type: 'message_stop' };
      }
    } catch (err: unknown) {
      // Abort signals should not be treated as errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      yield { type: 'error', error };
    }
  }

  /**
   * Extract parts from a GenerateContentResponse chunk.
   * Handles both `candidates[0].content.parts` and top-level `candidates[0].content.parts`.
   */
  private extractParts(chunk: GenerateContentResponse): Part[] {
    // Try candidates path
    const candidate = chunk.candidates?.[0];
    if (candidate?.content?.parts) {
      return candidate.content.parts;
    }
    return [];
  }
}
