import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamOpenAICodexResponses } from '@/ai/providers/openai-codex-responses';
import { CODEX_COMPAT_PROMPT } from '@/ai/providers/codex-compat-prompt';
import { createMockModel } from '../../_helpers/mock-models';
import {
  createAssistantMessage,
  createToolCallContent,
  createToolResultMessage,
  createUserMessage,
} from '../../_helpers/mock-messages';

describe('openai-codex-responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds Codex-compatible payloads without replay item ids', async () => {
    const fetchMock = vi.fn(async () => new Response(
      [
        'data: {"type":"response.output_item.added","item":{"type":"message","id":"msg_1","role":"assistant","content":[],"status":"in_progress"}}\n\n',
        'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}\n\n',
        'data: {"type":"response.output_text.delta","delta":"ok"}\n\n',
        'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_1","role":"assistant","content":[{"type":"output_text","text":"ok","annotations":[]}],"status":"completed"}}\n\n',
        'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2,"input_tokens_details":{"cached_tokens":0}}}}\n\n',
      ].join(''),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const payloads: unknown[] = [];
    const model = createMockModel({
      api: 'openai-codex-responses',
      provider: 'openai-codex',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      id: 'gpt-5.3-codex',
      reasoning: true,
    });
    const previousToolCall = createToolCallContent({
      id: 'call_123|item_456',
      name: 'bash',
      arguments: { cmd: 'pwd' },
    });

    const stream = streamOpenAICodexResponses(model as any, {
      systemPrompt: 'Base system prompt',
      tools: [],
      messages: [
        createUserMessage('hello'),
        createAssistantMessage([
          { type: 'text', text: 'running', textSignature: 'msg_should_be_removed' },
          previousToolCall,
        ], {
          api: 'openai-codex-responses' as any,
          provider: 'openai-codex',
          model: 'gpt-5.3-codex',
          stopReason: 'toolUse',
        }),
        createToolResultMessage(previousToolCall.id, 'done'),
      ],
    }, {
      apiKey: 'token',
      onPayload: (payload) => payloads.push(payload),
    });

    await stream.result();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = payloads[0] as any;
    expect(payload.store).toBe(false);
    expect(payload.instructions).toContain(CODEX_COMPAT_PROMPT);
    expect(payload.instructions).toContain('Base system prompt');
    expect(payload.max_output_tokens).toBeUndefined();
    expect(payload.input[0].role).toBe('user');

    const replayedMessage = payload.input.find((item: any) => item.type === 'message');
    expect(replayedMessage.id).toBeUndefined();

    const replayedFunctionCall = payload.input.find((item: any) => item.type === 'function_call');
    expect(replayedFunctionCall.id).toBeUndefined();
    expect(replayedFunctionCall.call_id).toBe('call_123');
  });
});
