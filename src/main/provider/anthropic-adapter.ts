import Anthropic from '@anthropic-ai/sdk';
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderMessage,
  ProviderToolDef,
  ProviderUserContent,
  ProviderAssistantContent,
  NormalizedStreamEvent,
  ContentBlockStart,
  ContentBlockDelta,
  ServerToolDef,
} from '@shared/provider-types';
import type { StopReason } from '@shared/types';
import {
  ADAPTIVE_THINKING_MODEL_PREFIXES,
  THINKING_LEVEL_TO_EFFORT,
  THINKING_LEVEL_TO_BUDGET,
  filterBlockedHeaders,
} from '@shared/constants';
import { createLogger } from '../store/logger';

const logger = createLogger('AnthropicAdapter');

// ---------------------------------------------------------------------------
// Message conversion: ProviderMessage[] -> Anthropic.MessageParam[]
// ---------------------------------------------------------------------------

function toAnthropicMessages(
  messages: ProviderMessage[],
): Anthropic.MessageParam[] {
  return messages.map((msg): Anthropic.MessageParam => {
    if (msg.role === 'user') {
      const content: Anthropic.ContentBlockParam[] = msg.content.map(
        (block: ProviderUserContent): Anthropic.ContentBlockParam => {
          switch (block.type) {
            case 'text':
              return { type: 'text', text: block.text };
            case 'image':
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: block.mimeType,
                  data: block.data,
                },
              };
            case 'tool_result':
              return {
                type: 'tool_result',
                tool_use_id: block.toolUseId,
                content: block.output,
                is_error: block.isError,
              };
          }
        },
      );
      return { role: 'user', content };
    }

    // assistant — includes server tool blocks passed through as raw objects
    const content: unknown[] = msg.content.map(
      (block: ProviderAssistantContent): unknown => {
        switch (block.type) {
          case 'text':
            return { type: 'text', text: block.text };
          case 'thinking':
            return {
              type: 'thinking',
              thinking: block.thinking,
              signature: block.signature ?? '',
            };
          case 'tool_use':
            return {
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            };
          case 'server_tool_use':
            return {
              type: 'server_tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
              ...(block.callerType ? {
                caller: {
                  type: block.callerType,
                  ...(block.callerToolId ? { tool_id: block.callerToolId } : {}),
                },
              } : {}),
            };
          case 'server_tool_result':
            // Restore original API type name: e.g. 'web_fetch_result' -> 'web_fetch_tool_result'
            return {
              type: block.resultType.replace(/_result$/, '_tool_result'),
              tool_use_id: block.toolUseId,
              content: block.content,
              ...(block.callerType ? {
                caller: {
                  type: block.callerType,
                  ...(block.callerToolId ? { tool_id: block.callerToolId } : {}),
                },
              } : {}),
            };
        }
      },
    );
    return { role: 'assistant', content: content as Anthropic.ContentBlockParam[] };
  });
}

// ---------------------------------------------------------------------------
// Tool conversion: ProviderToolDef[] -> Anthropic.Tool[]
// ---------------------------------------------------------------------------

function toAnthropicTools(tools: ProviderToolDef[]): Anthropic.Tool[] {
  return tools.map(
    (t): Anthropic.Tool => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildServerTools(serverTools: ServerToolDef[]): any[] {
  return serverTools.map(st => ({
    type: st.type,
    name: st.name,
    ...(st.maxUses != null ? { max_uses: st.maxUses } : {}),
    ...(st.allowedDomains ? { allowed_domains: st.allowedDomains } : {}),
    ...(st.blockedDomains ? { blocked_domains: st.blockedDomains } : {}),
    ...(st.maxContentTokens != null ? { max_content_tokens: st.maxContentTokens } : {}),
    ...(st.userLocation ? { user_location: st.userLocation } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Event mapping: Anthropic.RawMessageStreamEvent -> NormalizedStreamEvent
// ---------------------------------------------------------------------------

function mapBlockStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  block: any,
): ContentBlockStart {
  switch (block.type) {
    case 'text':
      return { type: 'text' };
    case 'thinking':
      return { type: 'thinking' };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name };
    case 'server_tool_use':
      return {
        type: 'server_tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
        callerType: block.caller?.type,
        callerToolId: block.caller?.tool_id,
      };
    default:
      // Match *_tool_result pattern (web_fetch_tool_result, code_execution_tool_result, etc.)
      if (typeof block.type === 'string' && block.type.endsWith('_tool_result')) {
        return {
          type: 'server_tool_result',
          toolUseId: block.tool_use_id,
          resultType: block.content?.type ?? block.type,
          content: block.content,
          callerType: block.caller?.type,
          callerToolId: block.caller?.tool_id,
        };
      }
      // redacted_thinking or unknown — treat as text
      return { type: 'text' };
  }
}

function mapDelta(
  delta: Anthropic.Messages.RawContentBlockDelta,
): ContentBlockDelta {
  switch (delta.type) {
    case 'text_delta':
      return { type: 'text_delta', text: delta.text };
    case 'thinking_delta':
      return { type: 'thinking_delta', thinking: delta.thinking };
    case 'signature_delta':
      return { type: 'signature_delta', signature: delta.signature };
    case 'input_json_delta':
      return { type: 'input_json_delta', partialJson: delta.partial_json };
    default:
      // citations_delta or unknown — emit empty text delta
      return { type: 'text_delta', text: '' };
  }
}

function mapStopReason(reason: string | null): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop_sequence';
    default:
      return 'end_turn';
  }
}

function mapEvent(
  event: Anthropic.Messages.RawMessageStreamEvent,
): NormalizedStreamEvent | null {
  switch (event.type) {
    case 'message_start':
      return { type: 'message_start' };

    case 'content_block_start':
      return {
        type: 'content_block_start',
        index: event.index,
        // Use `as any` because SDK types don't cover server_tool_use / *_tool_result
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        block: mapBlockStart(event.content_block as any),
      };

    case 'content_block_delta':
      return {
        type: 'content_block_delta',
        index: event.index,
        delta: mapDelta(event.delta),
      };

    case 'content_block_stop':
      return {
        type: 'content_block_stop',
        index: event.index,
      };

    case 'message_delta': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deltaUsage = event.usage as any;
      return {
        type: 'message_delta',
        stopReason: mapStopReason(event.delta.stop_reason),
        usage: deltaUsage
          ? {
              inputTokens: deltaUsage.input_tokens ?? 0,
              outputTokens: deltaUsage.output_tokens ?? 0,
              cacheReadTokens: deltaUsage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: deltaUsage.cache_creation_input_tokens ?? 0,
            }
          : undefined,
      };
    }

    case 'message_stop':
      return { type: 'message_stop' };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Mapping from server tool names to custom tool names they replace.
 * When a server tool is enabled, its corresponding custom tool is filtered out.
 */
const SERVER_TOOL_REPLACES: Record<string, string> = {
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
};

export class AnthropicAdapter implements ProviderAdapter {
  readonly id: string;
  private client: Anthropic;
  private serverTools: ServerToolDef[];

  constructor(apiKey: string, baseUrl?: string, id?: string, serverTools?: ServerToolDef[]) {
    this.id = id ?? 'anthropic';
    this.serverTools = serverTools ?? [];
    this.client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }

  async *stream(
    request: ProviderRequest,
  ): AsyncGenerator<NormalizedStreamEvent> {
    // Track input usage from message_start (Anthropic splits usage across two events)
    let inputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;

    try {
      // Filter out custom tools replaced by server tools, then merge
      const replacedNames = new Set(
        this.serverTools.map(st => SERVER_TOOL_REPLACES[st.name]).filter(Boolean),
      );
      const customTools = request.tools?.length
        ? toAnthropicTools(request.tools)
        : [];
      const builtServerTools = this.serverTools.length
        ? buildServerTools(this.serverTools)
        : [];
      const filteredCustomTools = customTools.filter(t => !replacedNames.has(t.name));
      const allTools = [...filteredCustomTools, ...builtServerTools];

      // --- Build params ---
      const maxTokens = request.maxTokens ?? 16_000;

      // Build thinking config based on thinkingLevel
      let thinkingConfig: Record<string, unknown> = {};
      if (request.thinkingLevel && request.thinkingLevel !== 'off') {
        const isAdaptive = ADAPTIVE_THINKING_MODEL_PREFIXES.some(
          prefix => request.model.startsWith(prefix),
        );
        if (isAdaptive) {
          thinkingConfig = { thinking: { type: 'adaptive' } };
          const effort = THINKING_LEVEL_TO_EFFORT[request.thinkingLevel];
          if (effort) {
            thinkingConfig.output_config = { effort };
          }
        } else {
          const budgetTokens = THINKING_LEVEL_TO_BUDGET[request.thinkingLevel]
            ?? request.thinkingBudget;
          if (budgetTokens && budgetTokens > 0) {
            thinkingConfig = {
              thinking: { type: 'enabled', budget_tokens: budgetTokens },
            };
          }
        }
      }

      const params: Record<string, unknown> = {
        model: request.model,
        max_tokens: maxTokens,
        messages: toAnthropicMessages(request.messages),
        stream: true,
        cache_control: { type: 'ephemeral' },
        ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
        ...(allTools.length > 0 ? { tools: allTools } : {}),
        ...thinkingConfig,
      };

      // extraParams override (highest priority)
      if (request.extraParams) {
        Object.assign(params, request.extraParams);
      }

      // customHeaders injection
      const safeHeaders = filterBlockedHeaders(request.customHeaders);

      const response = await this.client.messages.create(
        params as unknown as Anthropic.MessageCreateParamsStreaming,
        {
          signal: request.signal ?? undefined,
          ...(safeHeaders ? { headers: safeHeaders } : {}),
        },
      );

      for await (const event of response) {
        // Capture input usage from message_start
        if (event.type === 'message_start') {
          const usage = event.message?.usage;
          if (usage) {
            inputTokens = usage.input_tokens ?? 0;
            cacheReadTokens = (usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
            cacheWriteTokens = (usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
          }
          if (cacheReadTokens > 0 || cacheWriteTokens > 0) {
            logger.debug(`Cache stats - read: ${cacheReadTokens}, write: ${cacheWriteTokens}, input: ${inputTokens}`);
          }
        }

        const normalized = mapEvent(event);
        if (normalized) {
          // Merge usage: take the larger value from message_start vs message_delta
          // (Anthropic returns input in message_start; some providers return it in message_delta)
          if (normalized.type === 'message_delta' && normalized.usage) {
            normalized.usage.inputTokens = Math.max(normalized.usage.inputTokens, inputTokens);
            normalized.usage.cacheReadTokens = Math.max(normalized.usage.cacheReadTokens, cacheReadTokens);
            normalized.usage.cacheWriteTokens = Math.max(normalized.usage.cacheWriteTokens, cacheWriteTokens);
          }
          yield normalized;
        }
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
