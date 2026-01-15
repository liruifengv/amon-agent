import React from 'react';
import { Paperclip, ArrowUp, Square } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import PermissionModeSelector from './PermissionModeSelector';
import ProviderSelector from './ProviderSelector';

interface InputToolbarProps {
  isLoading: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
}

const InputToolbar: React.FC<InputToolbarProps> = ({ isLoading, canSend, onSend, onStop }) => {
  const { currentSessionId } = useSessionStore();

  if (!currentSessionId) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-600">
      {/* 左侧工具组 */}
      <div className="flex items-center gap-1">
        {/* 附件按钮 (UI 占位) */}
        <button
          disabled
          className="p-2 rounded-lg text-gray-400 dark:text-gray-500 opacity-50 cursor-not-allowed"
          title="附件 (开发中)"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Provider 选择器 */}
        <ProviderSelector />

        {/* 权限模式选择器 */}
        <PermissionModeSelector sessionId={currentSessionId} />
      </div>

      {/* 右侧发送/停止按钮 */}
      <div>
        {isLoading ? (
          <button
            onClick={onStop}
            className="
              w-8 h-8 flex items-center justify-center
              bg-gray-500 hover:bg-gray-600
              text-white rounded-lg
              transition-colors
            "
            title="停止生成"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            className={`
              w-8 h-8 flex items-center justify-center
              rounded-lg transition-colors
              ${canSend
                ? 'bg-primary-500 hover:bg-primary-600 text-white'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }
            `}
            title="发送消息"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default InputToolbar;
