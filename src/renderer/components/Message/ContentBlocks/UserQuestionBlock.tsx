import React, { useState } from 'react';
import { MessageCircleQuestion, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserQuestionRecord } from '../../../types';

export interface UserQuestionBlockProps {
  userQuestion: UserQuestionRecord;
}

const UserQuestionBlock: React.FC<UserQuestionBlockProps> = ({ userQuestion }) => {
  const { t } = useTranslation('message');
  const { questions, answers } = userQuestion;
  const hasAnswers = Object.keys(answers).length > 0;
  const [isExpanded, setIsExpanded] = useState(false);

  // 获取答案摘要（用于折叠时显示）
  const getAnswerSummary = () => {
    const answeredQuestions = questions.filter(q => answers[q.question]);
    if (answeredQuestions.length === 0) return '';
    const firstAnswer = answers[answeredQuestions[0].question];
    if (answeredQuestions.length === 1) {
      return firstAnswer.length > 30 ? firstAnswer.slice(0, 30) + '...' : firstAnswer;
    }
    return t('userQuestion.answerSummary', { answer: firstAnswer.length > 20 ? firstAnswer.slice(0, 20) + '...' : firstAnswer, count: answeredQuestions.length });
  };

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden ${
        hasAnswers
          ? 'border-info-border bg-info-muted'
          : 'border-border bg-muted/50'
      }`}
    >
      {/* 头部 - 可点击折叠/展开 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {/* 折叠/展开图标 */}
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}

        {/* 状态图标 */}
        {hasAnswers ? (
          <CheckCircle2 className="w-4 h-4 text-info" />
        ) : (
          <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" />
        )}

        {/* 状态文字 */}
        <span
          className={`text-sm font-medium ${
            hasAnswers ? 'text-info-muted-foreground' : 'text-muted-foreground'
          }`}
        >
          {hasAnswers ? t('userQuestion.answered') : t('userQuestion.skipped')}
        </span>

        {/* 折叠时显示答案摘要 */}
        {!isExpanded && hasAnswers && (
          <span className="text-xs text-muted-foreground truncate ml-2">
            {getAnswerSummary()}
          </span>
        )}
      </button>

      {/* 问题和答案列表 - 可折叠 */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {questions.map((q, index) => {
            const answer = answers[q.question];
            return (
              <div
                key={index}
                className="p-2.5 rounded-md bg-card"
              >
                {/* 问题标签和内容 */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {q.header}
                  </span>
                </div>
                <p className="text-sm text-foreground mb-2">
                  {q.question}
                </p>

                {/* 答案 */}
                {answer ? (
                  <div className="flex items-start gap-2 p-2 bg-info-muted rounded-md">
                    <span className="text-xs font-medium text-info whitespace-nowrap">
                      {t('userQuestion.answer')}
                    </span>
                    <span className="text-sm text-info-muted-foreground">
                      {answer}
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-muted rounded-md">
                    <span className="text-xs text-muted-foreground italic">
                      {t('userQuestion.notAnswered')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserQuestionBlock;
