import { create } from 'zustand';
import type { QuestionRequest, QuestionResponse } from '../types';

const EMPTY_REQUESTS: QuestionRequest[] = [];

interface QuestionState {
  pendingBySession: Record<string, QuestionRequest[]>;
  respondingIds: Record<string, boolean>;
  getPendingRequests: (sessionId: string | null) => QuestionRequest[];
  addRequest: (request: QuestionRequest) => void;
  resolveRequest: (sessionId: string, requestId: string) => void;
  respond: (requestId: string, response: QuestionResponse) => Promise<void>;
}

export const useQuestionStore = create<QuestionState>((set, get) => ({
  pendingBySession: {},
  respondingIds: {},

  getPendingRequests: (sessionId) => {
    if (!sessionId) {
      return EMPTY_REQUESTS;
    }

    return get().pendingBySession[sessionId] ?? EMPTY_REQUESTS;
  },

  addRequest: (request) => set((state) => ({
    pendingBySession: {
      ...state.pendingBySession,
      [request.sessionId]: [
        ...(state.pendingBySession[request.sessionId] ?? EMPTY_REQUESTS).filter((item) => item.id !== request.id),
        request,
      ].sort((a, b) => a.createdAt - b.createdAt),
    },
  })),

  resolveRequest: (sessionId, requestId) => set((state) => ({
    pendingBySession: {
      ...state.pendingBySession,
      [sessionId]: (state.pendingBySession[sessionId] ?? EMPTY_REQUESTS).filter((request) => request.id !== requestId),
    },
    respondingIds: {
      ...state.respondingIds,
      [requestId]: false,
    },
  })),

  respond: async (requestId, response) => {
    set((state) => ({
      respondingIds: {
        ...state.respondingIds,
        [requestId]: true,
      },
    }));

    try {
      const result = await window.ipc.question.respond(requestId, response) as { success?: boolean };
      if (!result?.success) {
        set((state) => ({
          respondingIds: {
            ...state.respondingIds,
            [requestId]: false,
          },
        }));
      }
    } catch (error) {
      set((state) => ({
        respondingIds: {
          ...state.respondingIds,
          [requestId]: false,
        },
      }));
      throw error;
    }
  },
}));

if (typeof window !== 'undefined' && window.push) {
  window.push.on('push:questionRequested', (request) => {
    useQuestionStore.getState().addRequest(request);
  });

  window.push.on('push:questionResolved', ({ sessionId, requestId }) => {
    useQuestionStore.getState().resolveRequest(sessionId, requestId);
  });
}
