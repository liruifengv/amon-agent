import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { Square, ArrowUp, Paperclip } from 'lucide-react';

const InputArea: React.FC = () => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, interruptMessage, isSessionLoading } = useChatStore();
  const { currentSessionId } = useSessionStore();

  // 当前会话是否正在加载
  const isLoading = isSessionLoading(currentSessionId);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || !currentSessionId || isLoading) return;

    const message = input.trim();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(message, currentSessionId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInterrupt = () => {
    if (currentSessionId) {
      interruptMessage(currentSessionId);
    }
  };

  const canSend = !!(input.trim() && currentSessionId && !isLoading);

  return (
    <div className="bg-main-background dark:bg-dark-main-background px-4 pb-4">
      <div className="max-w-3xl mx-auto">
        {/* 输入框容器 */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {/* 上半部分：输入区域 */}
          <div className="p-3 pb-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentSessionId ? '向 Amon 提问...' : '请先选择或创建会话'}
              disabled={!currentSessionId}
              rows={1}
              className="
                w-full py-2 px-2
                bg-transparent border-0 resize-none
                text-gray-900 dark:text-gray-100
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                focus:outline-none focus:ring-0
                disabled:opacity-50 disabled:cursor-not-allowed
                max-h-32
              "
              style={{ height: 'auto' }}
            />
          </div>

          {/* 下半部分：工具栏 */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* 左侧：附件按钮 + 选择器 */}
            <div className="flex items-center gap-2">
              {/* 附件按钮 */}
              <button
                disabled
                className="p-2 rounded-lg text-gray-400 dark:text-gray-500 opacity-50 cursor-not-allowed"
                title="附件 (开发中)"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <ProviderSelector />
              {currentSessionId && <PermissionModeSelector sessionId={currentSessionId} />}
            </div>

            {/* 右侧：发送/停止按钮 */}
            {isLoading ? (
              <button
                onClick={handleInterrupt}
                className="
                  w-9 h-9 flex items-center justify-center flex-shrink-0
                  bg-gray-500 hover:bg-gray-600
                  text-white rounded-full
                  transition-colors
                "
                title="停止生成"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className={`
                  w-9 h-9 flex items-center justify-center flex-shrink-0
                  rounded-full transition-colors border
                  ${canSend
                    ? 'bg-primary-500 hover:bg-primary-600 text-white border-primary-500'
                    : 'bg-primary-500/10 text-primary-500/40 border-primary-500/20 cursor-not-allowed'
                  }
                `}
                title="发送消息"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 导入所需的组件
import ProviderSelector from './ProviderSelector';
import PermissionModeSelector from './PermissionModeSelector';

export default InputArea;
