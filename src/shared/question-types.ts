export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  question: string;
  context?: string;
  options?: QuestionOption[];
  placeholder?: string;
  allowCustomAnswer: boolean;
  createdAt: number;
}

export type QuestionResponse =
  | { type: 'answer'; answer: string }
  | { type: 'dismiss' };

export interface QuestionResolved {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  outcome: 'answered' | 'dismissed';
  answer?: string;
}

export interface QuestionRequestToolUpdate {
  type: 'question_request';
  request: QuestionRequest;
}

export interface QuestionResolvedToolUpdate {
  type: 'question_resolved';
  requestId: string;
  outcome: 'answered' | 'dismissed';
  answer?: string;
}

export type QuestionToolUpdate =
  | QuestionRequestToolUpdate
  | QuestionResolvedToolUpdate;

export function isQuestionToolUpdate(value: unknown): value is QuestionToolUpdate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return type === 'question_request' || type === 'question_resolved';
}
