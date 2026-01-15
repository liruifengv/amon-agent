import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PermissionRecord } from '../../../types';
import { getToolConfig, getToolInputSummary } from '../../../config/tools';

export interface PermissionBlockProps {
  permission: PermissionRecord;
}

const PermissionBlock: React.FC<PermissionBlockProps> = ({ permission }) => {
  const isAllowed = permission.result === 'allow';
  const config = getToolConfig(permission.toolName);
  const summary = getToolInputSummary(permission.toolName, permission.input);

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden ${
        isAllowed
          ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10'
          : 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10'
      }`}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2">
        {isAllowed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${
            isAllowed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
          }`}
        >
          {isAllowed ? '已允许' : '已拒绝'}
        </span>
      </div>

      {/* 工具信息 */}
      <div className="px-3 pb-3">
        <div className={`flex items-start gap-2.5 p-2.5 rounded-md ${config.bgColor}`}>
          <div className={`p-1.5 rounded bg-white dark:bg-gray-800 shadow-sm ${config.color}`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${config.color}`}>
              {config.name}
            </div>
            {summary && (
              <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 font-mono break-all line-clamp-2">
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
