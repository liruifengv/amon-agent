import React, { useState } from 'react';
import { MessageCircleQuestion, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { UserQuestionRecord } from '../../../types';

export interface UserQuestionBlockProps {
  userQuestion: UserQuestionRecord;
}

const UserQuestionBlock: React.FC<UserQuestionBlockProps> = ({ userQuestion }) => {
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
    return `${firstAnswer.length > 20 ? firstAnswer.slice(0, 20) + '...' : firstAnswer} 等 ${answeredQuestions.length} 个回答`;
  };

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden ${
        hasAnswers
          ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'
      }`}
    >
      {/* 头部 - 可点击折叠/展开 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {/* 折叠/展开图标 */}
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}

        {/* 状态图标 */}
        {hasAnswers ? (
          <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-500" />
        ) : (
          <MessageCircleQuestion className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        )}

        {/* 状态文字 */}
        <span
          className={`text-sm font-medium ${
            hasAnswers ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {hasAnswers ? '已回答' : '已跳过'}
        </span>

        {/* 折叠时显示答案摘要 */}
        {!isExpanded && hasAnswers && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate ml-2">
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
                className="p-2.5 rounded-md bg-white dark:bg-gray-800/50"
              >
                {/* 问题标签和内容 */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                    {q.header}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  {q.question}
                </p>

                {/* 答案 */}
                {answer ? (
                  <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      回答:
                    </span>
                    <span className="text-sm text-blue-800 dark:text-blue-300">
                      {answer}
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                    <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                      未回答
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
