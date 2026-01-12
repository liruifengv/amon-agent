import React from 'react';
import {
  CheckCircle2,
  XCircle,
  FileText,
  Pencil,
  Edit,
  Terminal,
  Search,
  SearchCode,
  Globe,
  Settings,
} from 'lucide-react';
import { PermissionRecord } from '../../../types';

export interface PermissionBlockProps {
  permission: PermissionRecord;
}

// 工具配置
interface ToolConfig {
  icon: React.ReactNode;
  name: string;
  color: string;
  bgColor: string;
}

const TOOL_CONFIG: Record<string, ToolConfig> = {
  Read: {
    icon: <FileText className="w-4 h-4" />,
    name: '读取文件',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  Write: {
    icon: <Pencil className="w-4 h-4" />,
    name: '写入文件',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  Edit: {
    icon: <Edit className="w-4 h-4" />,
    name: '编辑文件',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  Bash: {
    icon: <Terminal className="w-4 h-4" />,
    name: '执行命令',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-900/20',
  },
  Glob: {
    icon: <Search className="w-4 h-4" />,
    name: '搜索文件',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  Grep: {
    icon: <SearchCode className="w-4 h-4" />,
    name: '搜索内容',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  WebFetch: {
    icon: <Globe className="w-4 h-4" />,
    name: '获取网页',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
  },
  WebSearch: {
    icon: <Search className="w-4 h-4" />,
    name: '网络搜索',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
  },
};

const DEFAULT_CONFIG: ToolConfig = {
  icon: <Settings className="w-4 h-4" />,
  name: '未知工具',
  color: 'text-gray-600 dark:text-gray-400',
  bgColor: 'bg-gray-50 dark:bg-gray-800',
};

// 获取输入摘要
function getInputSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return String(input.file_path || '');
    case 'Bash':
      return String(input.command || '');
    case 'Glob':
    case 'Grep':
      return String(input.pattern || '');
    case 'WebFetch':
      return String(input.url || '');
    case 'WebSearch':
      return String(input.query || '');
    default:
      return '';
  }
}

const PermissionBlock: React.FC<PermissionBlockProps> = ({ permission }) => {
  const isAllowed = permission.result === 'allow';
  const config = TOOL_CONFIG[permission.toolName] || { ...DEFAULT_CONFIG, name: permission.toolName };
  const summary = getInputSummary(permission.toolName, permission.input);

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
