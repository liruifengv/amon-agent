import React, { useState } from 'react';
import { ClipboardList, CheckCircle2, XCircle, ChevronDown, ChevronRight, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';
import { PlanApprovalRecord, PlanApprovalRequest } from '../../../types';
import { usePermissionStore } from '../../../store/permissionStore';

export interface PlanApprovalBlockProps {
  // 已完成的计划审批记录（历史记录）
  planApproval?: PlanApprovalRecord;
  // 待处理的计划审批请求（实时）
  pendingRequest?: PlanApprovalRequest;
}

/**
 * 计划审批组件
 * 用于显示 Claude 的执行计划并让用户审批
 */
const PlanApprovalBlock: React.FC<PlanApprovalBlockProps> = ({ planApproval, pendingRequest }) => {
  const { t } = useTranslation('message');
  const [isExpanded, setIsExpanded] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { respondToPlanApprovalRequest } = usePermissionStore();

  // 确定显示的数据来源
  const plan = pendingRequest?.plan || planApproval?.plan || '';
  const isPending = !!pendingRequest;
  const isApproved = planApproval?.approved;
  const responseMessage = planApproval?.message;

  // 处理审批
  const handleApprove = async () => {
    if (!pendingRequest) return;
    setIsSubmitting(true);
    try {
      await respondToPlanApprovalRequest(pendingRequest.id, {
        approved: true,
        message: feedback || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理拒绝
  const handleReject = async () => {
    if (!pendingRequest) return;
    setIsSubmitting(true);
    try {
      await respondToPlanApprovalRequest(pendingRequest.id, {
        approved: false,
        message: feedback || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 获取状态样式
  const getStatusStyles = () => {
    if (isPending) {
      return {
        border: 'border-primary/50',
        bg: 'bg-primary/5',
        icon: <ClipboardList className="w-4 h-4 text-primary" />,
        text: t('planApproval.waitingApproval'),
        textColor: 'text-primary',
      };
    }
    if (isApproved) {
      return {
        border: 'border-success/30',
        bg: 'bg-success/5',
        icon: <CheckCircle2 className="w-4 h-4 text-success" />,
        text: t('planApproval.approved'),
        textColor: 'text-success',
      };
    }
    return {
      border: 'border-destructive/30',
      bg: 'bg-destructive/5',
      icon: <XCircle className="w-4 h-4 text-destructive" />,
      text: t('planApproval.rejected'),
      textColor: 'text-destructive',
    };
  };

  const styles = getStatusStyles();

  return (
    <div className={`my-2 rounded-lg border overflow-hidden ${styles.border} ${styles.bg}`}>
      {/* 头部 */}
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
        {styles.icon}

        {/* 标题 */}
        <span className={`text-sm font-medium ${styles.textColor}`}>
          {t('planApproval.executePlan')}
        </span>

        {/* 状态标签 */}
        <span className={`text-xs px-1.5 py-0.5 rounded ${styles.bg} ${styles.textColor}`}>
          {styles.text}
        </span>
      </button>

      {/* 计划内容 */}
      {isExpanded && (
        <div className="px-3 pb-3">
          {/* Markdown 渲染的计划内容 */}
          <div className="p-3 rounded-md bg-card text-card-foreground border border-border mb-3 max-h-96 overflow-y-auto">
            <div className="markdown-content text-sm">
              <Streamdown plugins={{ code, math, cjk }}>{plan}</Streamdown>
            </div>
          </div>

          {/* 待审批状态：显示反馈输入和按钮 */}
          {isPending && (
            <>
              {/* 反馈输入框 */}
              <div className="mb-3">
                <div className="relative">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={t('planApproval.feedbackPlaceholder')}
                    className="w-full px-3 py-2 pr-10 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                    rows={2}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleReject}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('planApproval.reject')}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {t('planApproval.approve')}
                </button>
              </div>
            </>
          )}

          {/* 已完成状态：显示用户反馈 */}
          {!isPending && responseMessage && (
            <div className={`p-2 rounded-md ${isApproved ? 'bg-success/10' : 'bg-destructive/10'}`}>
              <span className={`text-xs font-medium ${isApproved ? 'text-success' : 'text-destructive'}`}>
                {t('planApproval.feedback')}
              </span>
              <span className="text-sm ml-2 text-foreground">
                {responseMessage}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlanApprovalBlock;
