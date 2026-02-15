import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import { ToolPermissionRequest } from '../../types';
import { usePermissionStore } from '../../store/permissionStore';
import { calculateRemainingSeconds } from '../../utils/countdown';
import { getToolConfig, getToolInputSummary } from '../../config/tools';

interface PermissionRequestProps {
  request: ToolPermissionRequest;
}

const PermissionRequest: React.FC<PermissionRequestProps> = ({ request }) => {
  const { t } = useTranslation('permission');
  const { t: tMessage } = useTranslation('message');
  const { respondToRequest } = usePermissionStore();
  const [showDetails, setShowDetails] = useState(false);
  // 根据请求的 timestamp 计算剩余时间
  const [countdown, setCountdown] = useState(() => calculateRemainingSeconds(request.timestamp));

  const handleAllow = useCallback(async () => {
    await respondToRequest(request.id, {
      behavior: 'allow',
      updatedInput: request.input,
    });
  }, [request.id, request.input, respondToRequest]);

  const handleDeny = useCallback(async () => {
    await respondToRequest(request.id, {
      behavior: 'deny',
      message: t('userDeniedOperation'),
    });
  }, [request.id, respondToRequest, t]);

  // 倒计时
  useEffect(() => {
    // 重新计算剩余时间（切换会话回来时）
    const remaining = calculateRemainingSeconds(request.timestamp);
    setCountdown(remaining);

    if (remaining <= 0) {
      handleDeny();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDeny();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [request.timestamp, handleDeny]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleAllow();
      } else if (e.key === 'Escape') {
        handleDeny();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAllow, handleDeny]);

  const config = getToolConfig(request.toolName);
  const summary = getToolInputSummary(request.toolName, request.input);

  return (
    <div className="my-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Shield className="w-4 h-4 text-warning" />
        <span className="text-sm font-medium text-foreground">{t('permissionRequest')}</span>
        <span className="text-xs text-muted-foreground ml-auto">{countdown}s</span>
      </div>

      {/* 工具信息 */}
      <div className="p-4">
        <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor}`}>
          <div className={`p-2 rounded-lg bg-card shadow-sm ${config.color}`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${config.color}`}>
              {tMessage(config.name)}
            </div>
            {summary && (
              <div className="mt-1 text-sm text-muted-foreground font-mono break-all line-clamp-2">
                {summary}
              </div>
            )}
          </div>
        </div>

        {/* 详细参数 */}
        <div className="mt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{t('viewDetailParams')}</span>
          </button>

          {showDetails && (
            <pre className="mt-2 text-xs font-mono text-muted-foreground p-3 rounded-lg bg-muted overflow-x-auto max-h-32 overflow-y-auto">
              {JSON.stringify(request.input, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-t border-border">
        <button
          onClick={handleDeny}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
            text-muted-foreground bg-card
            border border-border rounded-lg
            hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4" />
          {t('deny')}
        </button>
        <button
          onClick={handleAllow}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
            text-success-foreground bg-success rounded-lg
            hover:bg-success/90 transition-colors"
        >
          <Check className="w-4 h-4" />
          {t('allow')}
        </button>
      </div>
    </div>
  );
};

export default PermissionRequest;
