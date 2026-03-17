import { describe, expect, it, vi } from 'vitest';
import { createAskUserQuestionTool } from '@/main/tools/ask-user-question-tool';
import { QuestionService } from '@/main/questions/question-service';

function createContext() {
  return {
    cwd: '/workspace',
    signal: new AbortController().signal,
    sessionId: 's-1',
    toolCallId: 'tc-1',
    onQuestionUpdate: vi.fn(),
  };
}

describe('AskUserQuestion tool', () => {
  it('validates invalid input shapes', () => {
    const tool = createAskUserQuestionTool(new QuestionService());

    expect(tool.inputSchema.safeParse({
      question: '   ',
    }).success).toBe(false);

    expect(tool.inputSchema.safeParse({
      question: 'Choose one',
      options: [{ label: 'A' }],
    }).success).toBe(false);

    expect(tool.inputSchema.safeParse({
      question: 'Choose one',
      options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }],
    }).success).toBe(false);

    expect(tool.inputSchema.safeParse({
      question: 'Type only',
      allowCustomAnswer: false,
    }).success).toBe(false);

    expect(tool.inputSchema.safeParse({
      question: 'Choose one',
      options: [{ label: 'A' }, { label: '   ' }],
    }).success).toBe(false);
  });

  it('returns the answered value and emits question lifecycle updates', async () => {
    const service = new QuestionService();
    const tool = createAskUserQuestionTool(service);
    const context = createContext();

    const execution = tool.execute({
      question: 'Which branch?',
      options: [{ label: 'main' }, { label: 'develop' }],
      allowCustomAnswer: false,
    }, context);

    const [request] = service.listPendingForSession('s-1');
    expect(request.question).toBe('Which branch?');

    service.respond(request.id, { type: 'answer', answer: 'develop' });

    await expect(execution).resolves.toEqual({
      output: JSON.stringify({ answer: 'develop' }),
      isError: false,
      details: {
        question: 'Which branch?',
        context: undefined,
        options: [{ label: 'main', description: undefined }, { label: 'develop', description: undefined }],
        answer: 'develop',
        dismissed: false,
      },
    });

    expect(context.onQuestionUpdate).toHaveBeenNthCalledWith(1, {
      type: 'question_request',
      request: expect.objectContaining({
        sessionId: 's-1',
        toolCallId: 'tc-1',
        question: 'Which branch?',
      }),
    });
    expect(context.onQuestionUpdate).toHaveBeenNthCalledWith(2, {
      type: 'question_resolved',
      requestId: request.id,
      outcome: 'answered',
      answer: 'develop',
    });
  });

  it('returns an error result when the user dismisses the question', async () => {
    const service = new QuestionService();
    const tool = createAskUserQuestionTool(service);
    const context = createContext();

    const execution = tool.execute({
      question: 'Need confirmation?',
      context: 'This will overwrite a local patch.',
      allowCustomAnswer: true,
    }, context);

    const [request] = service.listPendingForSession('s-1');
    service.respond(request.id, { type: 'dismiss' });

    await expect(execution).resolves.toEqual({
      output: 'User dismissed question without answering.',
      isError: true,
      details: {
        question: 'Need confirmation?',
        context: 'This will overwrite a local patch.',
        options: undefined,
        dismissed: true,
      },
    });

    expect(context.onQuestionUpdate).toHaveBeenNthCalledWith(2, {
      type: 'question_resolved',
      requestId: request.id,
      outcome: 'dismissed',
    });
  });
});
