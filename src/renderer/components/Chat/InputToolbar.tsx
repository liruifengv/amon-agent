import React from 'react';
import { Paperclip, ArrowUp, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('chat');
  const { currentSessionId } = useSessionStore();

  if (!currentSessionId) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2">
      {/* 左侧工具组 */}
      <div className="flex items-center gap-1">
        {/* 附件按钮 (UI 占位) */}
        <button
          disabled
          className="p-2 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed"
          title={t('attachment')}
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
              bg-muted-foreground hover:bg-muted-foreground/80
              text-background rounded-lg
              transition-colors
            "
            title={t('stopGenerating')}
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
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
              }
            `}
            title={t('sendMessage')}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default InputToolbar;
