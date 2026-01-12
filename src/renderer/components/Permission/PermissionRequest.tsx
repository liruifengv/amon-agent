import React, { useState, useEffect, useCallback } from 'react';
import {
  Check,
  X,
  FileText,
  Pencil,
  Edit,
  Terminal,
  Search,
  SearchCode,
  Globe,
  Settings,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import { ToolPermissionRequest } from '../../types';
import { usePermissionStore } from '../../store/permissionStore';
import { calculateRemainingSeconds } from '../../utils/countdown';

interface PermissionRequestProps {
  request: ToolPermissionRequest;
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

const PermissionRequest: React.FC<PermissionRequestProps> = ({ request }) => {
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
      message: '用户拒绝了此操作',
    });
  }, [request.id, respondToRequest]);

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

  const config = TOOL_CONFIG[request.toolName] || { ...DEFAULT_CONFIG, name: request.toolName };
  const summary = getInputSummary(request.toolName, request.input);

  return (
    <div className="my-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <Shield className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">权限请求</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{countdown}s</span>
      </div>

      {/* 工具信息 */}
      <div className="p-4">
        <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor}`}>
          <div className={`p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm ${config.color}`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${config.color}`}>
              {config.name}
            </div>
            {summary && (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-300 font-mono break-all line-clamp-2">
                {summary}
              </div>
            )}
          </div>
        </div>

        {/* 详细参数 */}
        <div className="mt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>查看详细参数</span>
          </button>

          {showDetails && (
            <pre className="mt-2 text-xs font-mono text-gray-600 dark:text-gray-400 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 overflow-x-auto max-h-32 overflow-y-auto">
              {JSON.stringify(request.input, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={handleDeny}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
            text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700
            border border-gray-200 dark:border-gray-600 rounded-lg
            hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
          拒绝
        </button>
        <button
          onClick={handleAllow}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
            text-white bg-emerald-600 rounded-lg
            hover:bg-emerald-700 transition-colors"
        >
          <Check className="w-4 h-4" />
          允许
        </button>
      </div>
    </div>
  );
};

export default PermissionRequest;
