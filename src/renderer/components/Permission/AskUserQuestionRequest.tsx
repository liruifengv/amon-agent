import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  X,
  MessageCircleQuestion,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AskUserQuestionRequest as AskUserQuestionRequestType, AskUserQuestion } from '../../types';
import { usePermissionStore } from '../../store/permissionStore';
import { calculateRemainingSeconds } from '../../utils/countdown';

interface AskUserQuestionRequestProps {
  request: AskUserQuestionRequestType;
}

// 单个问题组件
interface QuestionItemProps {
  question: AskUserQuestion;
  selectedAnswers: string[];
  onAnswerChange: (answers: string[]) => void;
  customAnswer: string;
  onCustomAnswerChange: (value: string) => void;
}

const QuestionItem: React.FC<QuestionItemProps> = ({
  question,
  selectedAnswers,
  onAnswerChange,
  customAnswer,
  onCustomAnswerChange,
}) => {
  const { t } = useTranslation('permission');
  const [showOther, setShowOther] = useState(false);

  const handleOptionClick = (label: string) => {
    if (label === '__other__') {
      setShowOther(!showOther);
      if (!showOther) {
        // 切换到自定义输入时，清除选择的选项
        onAnswerChange([]);
      }
      return;
    }

    if (question.multiSelect) {
      // 多选
      if (selectedAnswers.includes(label)) {
        onAnswerChange(selectedAnswers.filter(a => a !== label));
      } else {
        onAnswerChange([...selectedAnswers, label]);
      }
      setShowOther(false);
      onCustomAnswerChange('');
    } else {
      // 单选
      onAnswerChange([label]);
      setShowOther(false);
      onCustomAnswerChange('');
    }
  };

  const handleCustomSubmit = () => {
    if (customAnswer.trim()) {
      onAnswerChange([customAnswer.trim()]);
    }
  };

  return (
    <div className="space-y-3">
      {/* 问题标题 */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {question.header}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">
        {question.question}
      </p>

      {/* 选项列表 */}
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = selectedAnswers.includes(option.label);
          return (
            <button
              key={index}
              onClick={() => handleOptionClick(option.label)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-info bg-info-muted'
                  : 'border-border hover:border-border hover:bg-accent'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-4 h-4 rounded ${
                    question.multiSelect ? 'rounded' : 'rounded-full'
                  } border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-info bg-info'
                      : 'border-muted-foreground'
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-info-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {option.label}
                  </div>
                  {option.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {/* Other 选项 */}
        <button
          onClick={() => handleOptionClick('__other__')}
          className={`w-full text-left p-3 rounded-lg border transition-colors ${
            showOther
              ? 'border-info bg-info-muted'
              : 'border-border hover:border-border hover:bg-accent'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded ${
                question.multiSelect ? 'rounded' : 'rounded-full'
              } border-2 flex items-center justify-center ${
                showOther
                  ? 'border-info bg-info'
                  : 'border-muted-foreground'
              }`}
            >
              {showOther && <Check className="w-2.5 h-2.5 text-info-foreground" />}
            </div>
            <span className="text-sm font-medium text-foreground">
              {t('askUserQuestion.other')}
            </span>
          </div>
        </button>

        {/* 自定义输入框 */}
        {showOther && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={customAnswer}
              onChange={(e) => onCustomAnswerChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCustomSubmit();
                }
              }}
              placeholder={t('askUserQuestion.enterAnswer')}
              className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-info"
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
};

const AskUserQuestionRequest: React.FC<AskUserQuestionRequestProps> = ({ request }) => {
  const { t } = useTranslation('permission');
  const { respondToQuestionRequest } = usePermissionStore();
  // 根据请求的 timestamp 计算剩余时间
  const [countdown, setCountdown] = useState(() => calculateRemainingSeconds(request.timestamp));
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set([0]));

  // 存储每个问题的答案
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});

  const handleSubmit = useCallback(async () => {
    // 构建答案对象：question -> answer string
    const answerRecord: Record<string, string> = {};
    request.questions.forEach((q, index) => {
      const selectedAnswers = answers[index] || [];
      const customAnswer = customAnswers[index] || '';

      // 如果有自定义答案且没有选择其他选项，使用自定义答案
      if (customAnswer && selectedAnswers.length === 0) {
        answerRecord[q.question] = customAnswer;
      } else if (selectedAnswers.length > 0) {
        answerRecord[q.question] = selectedAnswers.join(', ');
      }
    });

    await respondToQuestionRequest(request.id, answerRecord);
  }, [request, answers, customAnswers, respondToQuestionRequest]);

  const handleSkip = useCallback(async () => {
    // 提交空答案
    await respondToQuestionRequest(request.id, {});
  }, [request.id, respondToQuestionRequest]);

  // 倒计时
  useEffect(() => {
    // 重新计算剩余时间（切换会话回来时）
    const remaining = calculateRemainingSeconds(request.timestamp);
    setCountdown(remaining);

    if (remaining <= 0) {
      handleSkip();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSkip();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [request.timestamp, handleSkip]);

  // 检查是否有任何答案
  const hasAnyAnswer = Object.values(answers).some(a => a.length > 0) ||
    Object.values(customAnswers).some(a => a.trim().length > 0);

  const toggleQuestion = (index: number) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div className="my-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageCircleQuestion className="w-4 h-4 text-info" />
        <span className="text-sm font-medium text-foreground">
          {t('askUserQuestion.claudeNeedsInput')}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{countdown}s</span>
      </div>

      {/* 问题列表 */}
      <div className="p-4 space-y-4">
        {request.questions.map((question, index) => (
          <div key={index} className="border-b border-border last:border-0 pb-4 last:pb-0">
            {request.questions.length > 1 && (
              <button
                onClick={() => toggleQuestion(index)}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {t('askUserQuestion.questionProgress', { current: index + 1, total: request.questions.length })}
                </span>
                {expandedQuestions.has(index) ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            )}
            {(request.questions.length === 1 || expandedQuestions.has(index)) && (
              <QuestionItem
                question={question}
                selectedAnswers={answers[index] || []}
                onAnswerChange={(newAnswers) => setAnswers(prev => ({ ...prev, [index]: newAnswers }))}
                customAnswer={customAnswers[index] || ''}
                onCustomAnswerChange={(value) => setCustomAnswers(prev => ({ ...prev, [index]: value }))}
              />
            )}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-t border-border">
        <button
          onClick={handleSkip}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
            text-muted-foreground bg-card
            border border-border rounded-lg
            hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4" />
          {t('askUserQuestion.skip')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!hasAnyAnswer}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
            rounded-lg transition-colors ${
              hasAnyAnswer
                ? 'text-info-foreground bg-info hover:bg-info/90'
                : 'text-muted-foreground bg-muted cursor-not-allowed'
            }`}
        >
          <Check className="w-4 h-4" />
          {t('askUserQuestion.submit')}
        </button>
      </div>
    </div>
  );
};

export default AskUserQuestionRequest;
