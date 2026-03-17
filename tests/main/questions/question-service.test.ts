import { describe, expect, it } from 'vitest';
import {
  QuestionCancelledError,
  QuestionDismissedError,
  QuestionService,
} from '@/main/questions/question-service';
import type { QuestionRequest } from '@/shared/question-types';

function createRequest(overrides: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    id: 'q-1',
    sessionId: 's-1',
    toolCallId: 'tc-1',
    toolName: 'AskUserQuestion',
    question: 'Need input?',
    allowCustomAnswer: true,
    createdAt: 100,
    ...overrides,
  };
}

describe('QuestionService', () => {
  it('stores pending questions and resolves answered requests', async () => {
    const service = new QuestionService();
    const request = createRequest();
    const pendingResponse = service.requestQuestion(request);

    expect(service.listPendingForSession('s-1')).toEqual([request]);
    expect(service.respond(request.id, { type: 'answer', answer: 'Yes' })).toEqual(request);
    await expect(pendingResponse).resolves.toEqual({ type: 'answer', answer: 'Yes' });
    expect(service.listPendingForSession('s-1')).toEqual([]);
  });

  it('rejects dismissed requests and removes them from pending', async () => {
    const service = new QuestionService();
    const request = createRequest();
    const pendingResponse = service.requestQuestion(request);

    service.respond(request.id, { type: 'dismiss' });

    await expect(pendingResponse).rejects.toBeInstanceOf(QuestionDismissedError);
    expect(service.listPendingForSession('s-1')).toEqual([]);
  });

  it('rejectAllForSession only clears matching session questions', async () => {
    const service = new QuestionService();
    const first = createRequest({ id: 'q-1', sessionId: 's-1', createdAt: 100 });
    const second = createRequest({ id: 'q-2', sessionId: 's-2', createdAt: 101 });
    const firstPending = service.requestQuestion(first);
    const secondPending = service.requestQuestion(second);

    expect(service.rejectAllForSession('s-1')).toEqual([first]);

    await expect(firstPending).rejects.toBeInstanceOf(QuestionCancelledError);
    expect(service.listPendingForSession('s-1')).toEqual([]);
    expect(service.listPendingForSession('s-2')).toEqual([second]);

    service.respond('q-2', { type: 'answer', answer: 'Later' });
    await expect(secondPending).resolves.toEqual({ type: 'answer', answer: 'Later' });
  });
});
