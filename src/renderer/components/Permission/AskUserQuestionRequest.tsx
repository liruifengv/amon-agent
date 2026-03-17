import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuestionStore } from '../../store/questionStore';
import type { QuestionOption, QuestionRequest } from '../../types';
import { Button } from '../ui/button';

const EMPTY_PENDING: never[] = [];

interface AskUserQuestionRequestProps {
  sessionId: string;
}

interface AskUserQuestionPanelProps {
  request: QuestionRequest;
  responding: boolean;
  respond: (requestId: string, response: { type: 'answer'; answer: string } | { type: 'dismiss' }) => Promise<void>;
}

const AskUserQuestionPanel: React.FC<AskUserQuestionPanelProps> = ({ request, responding, respond }) => {
  const { t } = useTranslation('permission');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const hasOptions = Boolean(request.options?.length);
  const canUseCustomAnswer = request.allowCustomAnswer ?? true;

  const canSubmit = useMemo(() => {
    if (responding) {
      return false;
    }

    if (!hasOptions) {
      return draftAnswer.trim().length > 0;
    }

    if (!canUseCustomAnswer) {
      return false;
    }

    return draftAnswer.trim().length > 0;
  }, [responding, hasOptions, canUseCustomAnswer, draftAnswer]);

  const submitAnswer = async (answer: string) => {
    const trimmed = answer.trim();
    if (!trimmed) {
      return;
    }

    await respond(request.id, {
      type: 'answer',
      answer: trimmed,
    });
  };

  const handleOptionClick = async (option: QuestionOption) => {
    if (!canUseCustomAnswer) {
      await submitAnswer(option.label);
      return;
    }

    setSelectedOption(option.label);
    setDraftAnswer(option.label);
  };

  const handleDismiss = async () => {
    await respond(request.id, { type: 'dismiss' });
  };

  const customInputLabel = hasOptions ? t('askUserQuestion.other') : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-sky-500/20 p-1.5 text-sky-700 dark:text-sky-300">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-medium text-foreground">
            {t('askUserQuestion.claudeNeedsInput')}
          </div>
          <div className="text-sm text-foreground">
            {request.question}
          </div>
          {request.context && (
            <div className="text-sm text-muted-foreground">
              {request.context}
            </div>
          )}
        </div>
      </div>

      {hasOptions && (
        <div className="flex flex-wrap gap-2">
          {request.options?.map((option) => {
            const isSelected = selectedOption === option.label && canUseCustomAnswer;

            return (
              <button
                key={option.label}
                type="button"
                disabled={responding}
                onClick={() => void handleOptionClick(option)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 text-foreground'
                    : 'border-border bg-background/80 text-foreground hover:bg-background'
                } ${responding ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="text-sm font-medium">{option.label}</div>
                {option.description && (
                  <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {canUseCustomAnswer && (
        <div className="space-y-2">
          {customInputLabel && (
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {customInputLabel}
            </div>
          )}
          <textarea
            value={draftAnswer}
            disabled={responding}
            onChange={(event) => setDraftAnswer(event.target.value)}
            rows={3}
            placeholder={request.placeholder || t('askUserQuestion.enterAnswer')}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={responding}
          onClick={() => void handleDismiss()}
        >
          {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('askUserQuestion.skip')}
        </Button>
        {canUseCustomAnswer && (
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => void submitAnswer(draftAnswer)}
          >
            {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('askUserQuestion.submit')}
          </Button>
        )}
      </div>
    </div>
  );
};

const AskUserQuestionRequest: React.FC<AskUserQuestionRequestProps> = ({ sessionId }) => {
  const pendingRequests = useQuestionStore((state) => state.pendingBySession[sessionId] ?? EMPTY_PENDING);
  const respond = useQuestionStore((state) => state.respond);
  const respondingIds = useQuestionStore((state) => state.respondingIds);
  const request = pendingRequests[0] ?? null;

  if (!request) {
    return null;
  }

  const responding = respondingIds[request.id] ?? false;

  return (
    <div className="mb-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 shadow-sm">
      <AskUserQuestionPanel
        key={request.id}
        request={request}
        responding={responding}
        respond={respond}
      />
    </div>
  );
};

export default AskUserQuestionRequest;
