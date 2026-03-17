import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { QuestionOption, QuestionRequest } from '@shared/question-types';
import {
  QuestionCancelledError,
  QuestionDismissedError,
  QuestionService,
} from '../questions/question-service';
import type { Tool, ToolContext, ToolResult } from './types';

const questionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});

const askUserQuestionInputSchema = z.object({
  question: z.string(),
  context: z.string().optional(),
  options: z.array(questionOptionSchema).optional(),
  placeholder: z.string().optional(),
  allowCustomAnswer: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  if (value.question.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'question must not be empty',
      path: ['question'],
    });
  }

  if (!value.options) {
    if (value.allowCustomAnswer === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allowCustomAnswer must be true when options are omitted',
        path: ['allowCustomAnswer'],
      });
    }
    return;
  }

  if (value.options.length < 2 || value.options.length > 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'options must contain between 2 and 4 items',
      path: ['options'],
    });
  }

  value.options.forEach((option, index) => {
    if (option.label.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'option label must not be empty',
        path: ['options', index, 'label'],
      });
    }
  });
});

export type AskUserQuestionInput = z.infer<typeof askUserQuestionInputSchema>;

interface AskUserQuestionResultDetails {
  question: string;
  context?: string;
  options?: QuestionOption[];
  answer?: string;
  dismissed: boolean;
}

function normalizeOptions(options?: QuestionOption[]): QuestionOption[] | undefined {
  if (!options || options.length === 0) {
    return undefined;
  }

  return options.map((option) => ({
    label: option.label.trim(),
    description: option.description?.trim() || undefined,
  }));
}

function ensureAnswerMatchesOptions(answer: string, options?: QuestionOption[], allowCustomAnswer?: boolean): void {
  if (!options || allowCustomAnswer !== false) {
    return;
  }

  if (!options.some((option) => option.label === answer)) {
    throw new Error('Answer must match one of the provided options.');
  }
}

function requireQuestionContext(context: ToolContext): asserts context is ToolContext & {
  sessionId: string;
  toolCallId: string;
} {
  if (!context.sessionId || !context.toolCallId) {
    throw new Error('AskUserQuestion requires sessionId and toolCallId in tool context.');
  }
}

export function createAskUserQuestionTool(questionService: QuestionService): Tool<AskUserQuestionInput> {
  return {
    name: 'AskUserQuestion',
    description: 'Ask the user one blocking clarification question and wait for a single answer before continuing.',
    inputSchema: askUserQuestionInputSchema,
    execute: async (input: AskUserQuestionInput, context: ToolContext): Promise<ToolResult> => {
      requireQuestionContext(context);

      const question = input.question.trim();
      const normalizedContext = input.context?.trim() || undefined;
      const options = normalizeOptions(input.options);
      const allowCustomAnswer = input.allowCustomAnswer ?? true;

      const request: QuestionRequest = {
        id: nanoid(),
        sessionId: context.sessionId,
        toolCallId: context.toolCallId,
        toolName: 'AskUserQuestion',
        question,
        context: normalizedContext,
        options,
        placeholder: input.placeholder,
        allowCustomAnswer,
        createdAt: Date.now(),
      };

      context.onQuestionUpdate?.({
        type: 'question_request',
        request,
      });

      try {
        const response = await questionService.requestQuestion(request);

        if (response.type !== 'answer') {
          throw new QuestionDismissedError();
        }

        const answer = response.answer.trim();
        ensureAnswerMatchesOptions(answer, options, allowCustomAnswer);

        context.onQuestionUpdate?.({
          type: 'question_resolved',
          requestId: request.id,
          outcome: 'answered',
          answer,
        });

        return {
          output: JSON.stringify({ answer }),
          isError: false,
          details: {
            question,
            context: normalizedContext,
            options,
            answer,
            dismissed: false,
          } satisfies AskUserQuestionResultDetails,
        };
      } catch (error) {
        if (error instanceof QuestionDismissedError || error instanceof QuestionCancelledError) {
          context.onQuestionUpdate?.({
            type: 'question_resolved',
            requestId: request.id,
            outcome: 'dismissed',
          });

          return {
            output: error instanceof QuestionDismissedError
              ? 'User dismissed question without answering.'
              : error.message,
            isError: true,
            details: {
              question,
              context: normalizedContext,
              options,
              dismissed: true,
            } satisfies AskUserQuestionResultDetails,
          };
        }

        throw error;
      }
    },
  };
}
