import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PermissionRecord } from '../../../types';
import { getToolConfig, getToolInputSummary } from '../../../config/tools';

export interface PermissionBlockProps {
  permission: PermissionRecord;
}

const PermissionBlock: React.FC<PermissionBlockProps> = ({ permission }) => {
  const { t } = useTranslation('message');
  const isAllowed = permission.result === 'allow';
  const config = getToolConfig(permission.toolName);
  const summary = getToolInputSummary(permission.toolName, permission.input);

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden ${
        isAllowed
          ? 'border-success/30 bg-success/5'
          : 'border-destructive/30 bg-destructive/5'
      }`}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2">
        {isAllowed ? (
          <CheckCircle2 className="w-4 h-4 text-success" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive" />
        )}
        <span
          className={`text-sm font-medium ${
            isAllowed ? 'text-success' : 'text-destructive'
          }`}
        >
          {isAllowed ? t('permission.allowed') : t('permission.denied')}
        </span>
      </div>

      {/* 工具信息 */}
      <div className="px-3 pb-3">
        <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-muted/50 border border-border">
          <div className="p-1.5 rounded bg-card shadow-sm text-muted-foreground">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">
              {t(config.name)}
            </div>
            {summary && (
              <div className="mt-0.5 text-xs text-muted-foreground font-mono break-all line-clamp-2">
                {summary}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionBlock;
