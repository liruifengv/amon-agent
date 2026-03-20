import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockModel } from '../../_helpers/mock-models';
import { createAssistantMessage, createUserMessage } from '../../_helpers/mock-messages';

const { completeSimpleMock } = vi.hoisted(() => ({
  completeSimpleMock: vi.fn(),
}));

vi.mock('@/ai', async () => {
  const actual = await vi.importActual<typeof import('@/ai')>('@/ai');
  return {
    ...actual,
    completeSimple: completeSimpleMock,
  };
});

vi.mock('@/main/store/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { CompactionService } from '@/main/agent/compaction-service';

describe('CompactionService', () => {
  beforeEach(() => {
    completeSimpleMock.mockReset();
  });

  it('builds active context from snapshot preface and recent tail', () => {
    const service = new CompactionService();
    const snapshot = {
      summary: [
        '<compaction_summary>',
        '  <current_focus>Continue implementation.</current_focus>',
        '  <constraints_and_preferences><item>None.</item></constraints_and_preferences>',
        '  <environment><item>None.</item></environment>',
        '  <completed_tasks><item>None.</item></completed_tasks>',
        '  <active_issues><item>None.</item></active_issues>',
        '  <code_state><item>None.</item></code_state>',
        '  <important_context><item>None.</item></important_context>',
        '  <next_steps><item>None.</item></next_steps>',
        '</compaction_summary>',
      ].join('\n'),
      firstKeptMessageIndex: 1,
      tokensBefore: 42000,
      createdAt: 200,
      source: 'auto-threshold' as const,
    };
    const messages = [
      createUserMessage('older context', { timestamp: 100 }),
      createAssistantMessage([{ type: 'text', text: '' }], {
        timestamp: 150,
        stopReason: 'error',
        errorMessage: 'maximum context length is 200000 tokens',
      }),
      createUserMessage('keep this tail', { timestamp: 160 }),
    ];

    const activeMessages = service.buildActiveMessages({
      messages,
      snapshot,
      contextWindow: 200000,
    });

    expect(activeMessages).toHaveLength(2);
    expect(activeMessages[0].role).toBe('user');
    expect(activeMessages[1]).toEqual(messages[2]);
    if (activeMessages[0].role === 'user' && Array.isArray(activeMessages[0].content)) {
      expect(activeMessages[0].content[0]).toEqual(expect.objectContaining({
        type: 'text',
        text: expect.stringContaining(snapshot.summary),
      }));
    }
  });

  it('creates a new snapshot from older messages while keeping the recent tail', async () => {
    completeSimpleMock.mockResolvedValue(
      createAssistantMessage([{ type: 'text', text: [
        '<compaction_summary>',
        '  <current_focus>Summarized.</current_focus>',
        '  <constraints_and_preferences><item>None.</item></constraints_and_preferences>',
        '  <environment><item>None.</item></environment>',
        '  <completed_tasks><item>None.</item></completed_tasks>',
        '  <active_issues><item>None.</item></active_issues>',
        '  <code_state><item>None.</item></code_state>',
        '  <important_context><item>None.</item></important_context>',
        '  <next_steps><item>None.</item></next_steps>',
        '</compaction_summary>',
      ].join('\n') }], {
        timestamp: 999,
      }),
    );

    const service = new CompactionService();
    const model = createMockModel({ contextWindow: 200000, maxTokens: 8192 });
    const messages = [
      createUserMessage('first task details', { timestamp: 100 }),
      createAssistantMessage([{ type: 'text', text: 'first answer details' }], { timestamp: 110 }),
      createUserMessage('second task details', { timestamp: 120 }),
      createAssistantMessage([{ type: 'text', text: 'second answer details' }], { timestamp: 130 }),
      createUserMessage('latest task details', { timestamp: 140 }),
      createAssistantMessage([{ type: 'text', text: 'latest answer details' }], { timestamp: 150 }),
    ];

    const result = await service.compact({
      sessionId: 's1',
      messages,
      model,
      source: 'auto-threshold',
      tokensBefore: 64000,
      keepRecentTokens: 30,
    });

    expect(result).not.toBeNull();
    expect(result?.snapshot.summary).toContain('<compaction_summary>');
    expect(result?.snapshot.firstKeptMessageIndex).toBe(4);
    expect(result?.snapshot.tokensAfter).toBeDefined();
    expect(result?.snapshot.tokensAfter).toBeLessThan(result!.snapshot.tokensBefore);
    expect(result?.notice.source).toBe('auto-threshold');
    expect(result?.notice.tokensAfter).toBe(result?.snapshot.tokensAfter);

    expect(completeSimpleMock).toHaveBeenCalledTimes(1);
    const [, context] = completeSimpleMock.mock.calls[0];
    expect(context.messages[0].content[0].text).toContain('first task details');
    expect(context.messages[0].content[0].text).toContain('second answer details');
    expect(context.messages[0].content[0].text).not.toContain('latest task details');
  });

  it('rejects compaction output that is not valid XML summary', async () => {
    completeSimpleMock.mockResolvedValue(
      createAssistantMessage([{ type: 'text', text: 'plain text summary' }], {
        timestamp: 999,
      }),
    );

    const service = new CompactionService();
    const model = createMockModel({ contextWindow: 200000, maxTokens: 8192 });
    const messages = [
      createUserMessage('first task details', { timestamp: 100 }),
      createAssistantMessage([{ type: 'text', text: 'first answer details' }], { timestamp: 110 }),
      createUserMessage('latest task details', { timestamp: 140 }),
      createAssistantMessage([{ type: 'text', text: 'latest answer details' }], { timestamp: 150 }),
    ];

    await expect(service.compact({
      sessionId: 's1',
      messages,
      model,
      source: 'auto-threshold',
      tokensBefore: 64000,
      keepRecentTokens: 30,
    })).rejects.toThrow('Compaction summary must be wrapped');
  });

  it('does not compact when only the latest unfinished user turn would remain', async () => {
    const service = new CompactionService();
    const model = createMockModel({ contextWindow: 200000, maxTokens: 8192 });
    const messages = [
      createUserMessage('first task details', { timestamp: 100 }),
      createAssistantMessage([{ type: 'text', text: 'first answer details' }], { timestamp: 110 }),
      createUserMessage('latest unfinished task details', { timestamp: 120 }),
    ];

    const result = await service.compact({
      sessionId: 's1',
      messages,
      model,
      source: 'auto-threshold',
      tokensBefore: 64000,
      keepRecentTokens: 1,
    });

    expect(result).toBeNull();
    expect(completeSimpleMock).not.toHaveBeenCalled();
  });
});
