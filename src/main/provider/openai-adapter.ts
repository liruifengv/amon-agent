import OpenAI from 'openai';
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

// ---------------------------------------------------------------------------
// Message conversion: ProviderMessage[] -> OpenAI.ChatCompletionMessageParam[]
// ---------------------------------------------------------------------------

function toOpenAIMessages(
  messages: ProviderMessage[],
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      // Separate tool_result blocks from regular content
      const regularContent: ProviderUserContent[] = [];
      const toolResults: Extract<
        ProviderUserContent,
        { type: 'tool_result' }
      >[] = [];

      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          toolResults.push(block);
        } else {
          regularContent.push(block);
        }
      }

      // Emit tool messages first (they must come right after assistant tool_calls)
      for (const tr of toolResults) {
        result.push({
          role: 'tool',
          tool_call_id: tr.toolUseId,
          content: tr.output,
        });
      }

      // Emit user message with remaining content (if any)
      if (regularContent.length > 0) {
        const parts: OpenAI.ChatCompletionContentPart[] = regularContent.map(
          (block): OpenAI.ChatCompletionContentPart => {
            if (block.type === 'image') {
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${block.mimeType};base64,${block.data}`,
                },
              };
            }
            // text (or any unexpected type)
            return {
              type: 'text',
              text: block.type === 'text' ? block.text : '',
            };
          },
        );
        result.push({ role: 'user', content: parts });
      }
    } else {
      // assistant
      let textContent = '';
      const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];

      for (const block of msg.content as ProviderAssistantContent[]) {
        switch (block.type) {
          case 'text':
            textContent += block.text;
            break;
          case 'thinking':
            // OpenAI does not support thinking blocks — skip
            break;
          case 'tool_use':
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
            break;
          case 'server_tool_use':
          case 'server_tool_result':
            // Anthropic server tool blocks — skip for OpenAI
            break;
        }
      }

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: textContent || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
      result.push(assistantMsg);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool conversion: ProviderToolDef[] -> OpenAI.ChatCompletionTool[]
// ---------------------------------------------------------------------------

function toOpenAITools(
  tools: ProviderToolDef[],
): OpenAI.ChatCompletionTool[] {
  return tools.map(
    (t): OpenAI.ChatCompletionTool => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// finish_reason mapping
// ---------------------------------------------------------------------------

function mapFinishReason(reason: string | null): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class OpenAIAdapter implements ProviderAdapter {
  readonly id: string;
  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string, id?: string) {
    this.id = id ?? 'openai';
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }

  async *stream(
    request: ProviderRequest,
  ): AsyncGenerator<NormalizedStreamEvent> {
    // Internal state to synthesize block lifecycle events
    let messageStarted = false;
    let currentTextBlockOpen = false;
    let nextBlockIndex = 0;
    // Map: tool_call index (from OpenAI chunk) -> our block index
    const toolBlockIndices = new Map<number, number>();
    // Track which tool blocks have been started
    const startedToolBlocks = new Set<number>();

    try {
      const messages = toOpenAIMessages(request.messages);

      // Prepend system message if provided
      if (request.systemPrompt) {
        messages.unshift({
          role: 'system',
          content: request.systemPrompt,
        });
      }

      const params: OpenAI.ChatCompletionCreateParamsStreaming = {
        model: request.model,
        messages,
        stream: true,
        ...(request.maxTokens
          ? { max_tokens: request.maxTokens }
          : {}),
        ...(request.tools && request.tools.length > 0
          ? { tools: toOpenAITools(request.tools) }
          : {}),
        // thinkingBudget is ignored for OpenAI
      };

      const response = await this.client.chat.completions.create(params, {
        signal: request.signal ?? undefined,
      });

      for await (const chunk of response) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Emit message_start on first chunk
        if (!messageStarted) {
          messageStarted = true;
          yield { type: 'message_start' };
        }

        // Handle text content
        if (delta.content != null && delta.content !== '') {
          if (!currentTextBlockOpen) {
            currentTextBlockOpen = true;
            yield {
              type: 'content_block_start',
              index: nextBlockIndex,
              block: { type: 'text' },
            };
            nextBlockIndex++;
          }
          yield {
            type: 'content_block_delta',
            index: nextBlockIndex - 1,
            delta: { type: 'text_delta', text: delta.content },
          };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          // Close text block before tool calls if open
          if (currentTextBlockOpen) {
            currentTextBlockOpen = false;
            yield {
              type: 'content_block_stop',
              index: nextBlockIndex - 1,
            };
          }

          for (const tc of delta.tool_calls) {
            const tcIndex = tc.index;

            // Allocate a block index for this tool call if not seen before
            if (!toolBlockIndices.has(tcIndex)) {
              toolBlockIndices.set(tcIndex, nextBlockIndex);
              nextBlockIndex++;
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by has-check + set above
            const blockIndex = toolBlockIndices.get(tcIndex)!;

            // Emit content_block_start for new tool blocks
            if (!startedToolBlocks.has(tcIndex) && tc.id && tc.function?.name) {
              startedToolBlocks.add(tcIndex);
              yield {
                type: 'content_block_start',
                index: blockIndex,
                block: {
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function.name,
                },
              };
            }

            // Stream argument deltas
            if (tc.function?.arguments) {
              yield {
                type: 'content_block_delta',
                index: blockIndex,
                delta: {
                  type: 'input_json_delta',
                  partialJson: tc.function.arguments,
                },
              };
            }
          }
        }

        // Handle finish
        if (choice.finish_reason != null) {
          // Close any open text block
          if (currentTextBlockOpen) {
            currentTextBlockOpen = false;
            yield {
              type: 'content_block_stop',
              index: nextBlockIndex - 1,
            };
          }

          // Close all open tool blocks
          for (const [, blockIndex] of toolBlockIndices) {
            yield { type: 'content_block_stop', index: blockIndex };
          }

          // Emit message_delta with stop reason and usage
          yield {
            type: 'message_delta',
            stopReason: mapFinishReason(choice.finish_reason),
            usage: chunk.usage
              ? {
                  inputTokens: chunk.usage.prompt_tokens,
                  outputTokens: chunk.usage.completion_tokens,
                  cacheReadTokens: 0,
                  cacheWriteTokens: 0,
                }
              : undefined,
          };

          // Emit message_stop
          yield { type: 'message_stop' };
        }
      }

      // Safety: if stream ended without finish_reason, close everything
      if (messageStarted) {
        if (currentTextBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: nextBlockIndex - 1,
          };
        }
        // Check if we got a message_stop already (finish_reason was present)
        // If not, emit closing events
      }
    } catch (err: unknown) {
      // Abort signals should not be treated as errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const error =
        err instanceof Error ? err : new Error(String(err));
      yield { type: 'error', error };
    }
  }
}
