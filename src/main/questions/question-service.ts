import type { QuestionRequest, QuestionResponse } from '@shared/question-types';

interface PendingQuestion {
  request: QuestionRequest;
  resolve: (response: QuestionResponse) => void;
  reject: (error: Error) => void;
}

export class QuestionDismissedError extends Error {
  constructor(message = 'User dismissed question without answering.') {
    super(message);
    this.name = 'QuestionDismissedError';
  }
}

export class QuestionCancelledError extends Error {
  constructor(message = 'Question request cancelled.') {
    super(message);
    this.name = 'QuestionCancelledError';
  }
}

export class QuestionService {
  private pending = new Map<string, PendingQuestion>();

  async requestQuestion(request: QuestionRequest): Promise<QuestionResponse> {
    return new Promise<QuestionResponse>((resolve, reject) => {
      this.pending.set(request.id, {
        request,
        resolve: (response) => {
          this.pending.delete(request.id);
          resolve(response);
        },
        reject: (error) => {
          this.pending.delete(request.id);
          reject(error);
        },
      });
    });
  }

  respond(requestId: string, response: QuestionResponse): QuestionRequest | null {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return null;
    }

    if (response.type === 'answer') {
      pending.resolve(response);
    } else {
      pending.reject(new QuestionDismissedError());
    }

    return pending.request;
  }

  rejectAllForSession(sessionId: string): QuestionRequest[] {
    const rejected: QuestionRequest[] = [];

    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.request.sessionId !== sessionId) {
        continue;
      }

      this.pending.delete(requestId);
      pending.reject(new QuestionCancelledError());
      rejected.push(pending.request);
    }

    return rejected;
  }

  listPendingForSession(sessionId: string): QuestionRequest[] {
    return Array.from(this.pending.values())
      .map((item) => item.request)
      .filter((request) => request.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}
