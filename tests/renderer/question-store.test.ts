import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuestionStore } from '@/renderer/store/questionStore';
import type { QuestionRequest } from '@/shared/question-types';

function createRequest(overrides: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    id: 'q-1',
    sessionId: 's-1',
    toolCallId: 'tc-1',
    toolName: 'AskUserQuestion',
    question: 'Which environment?',
    allowCustomAnswer: true,
    createdAt: 100,
    ...overrides,
  };
}

describe('questionStore', () => {
  beforeEach(() => {
    useQuestionStore.setState({
      pendingBySession: {},
      respondingIds: {},
    });
    (globalThis as any).window = {
      ipc: {
        question: {
          respond: vi.fn(async () => ({ success: true })),
        },
      },
    };
  });

  it('adds and resolves pending requests per session', () => {
    const first = createRequest({ id: 'q-1', createdAt: 101 });
    const second = createRequest({ id: 'q-2', createdAt: 100 });

    useQuestionStore.getState().addRequest(first);
    useQuestionStore.getState().addRequest(second);

    expect(useQuestionStore.getState().getPendingRequests('s-1').map((request) => request.id)).toEqual(['q-2', 'q-1']);

    useQuestionStore.getState().resolveRequest('s-1', 'q-2');

    expect(useQuestionStore.getState().getPendingRequests('s-1').map((request) => request.id)).toEqual(['q-1']);
  });

  it('respond forwards to ipc and clears responding state on success', async () => {
    const request = createRequest();
    useQuestionStore.getState().addRequest(request);

    await useQuestionStore.getState().respond(request.id, { type: 'answer', answer: 'staging' });
    useQuestionStore.getState().resolveRequest('s-1', request.id);

    expect((globalThis as any).window.ipc.question.respond).toHaveBeenCalledWith(request.id, {
      type: 'answer',
      answer: 'staging',
    });
    expect(useQuestionStore.getState().respondingIds[request.id]).toBe(false);
  });
});
