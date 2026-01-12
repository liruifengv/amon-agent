import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import InputToolbar from './InputToolbar';

const InputArea: React.FC = () => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, interruptQuery, isSessionLoading } = useChatStore();
  const { currentSessionId } = useSessionStore();

  // 当前会话是否正在加载
  const isLoading = isSessionLoading(currentSessionId);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      if (!input) {
        textareaRef.current.style.height = '';
      } else {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    }
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || !currentSessionId || isLoading) return;

    const message = input.trim();
    setInput('');
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
      interruptQuery(currentSessionId);
    }
  };

  const canSend = input.trim() && currentSessionId && !isLoading;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 px-4 pb-4">
      <div className="max-w-3xl mx-auto">
        {/* 工具栏 */}
        <InputToolbar />

        <div className="relative">
          {/* 输入框容器 */}
          <div className="relative flex items-end bg-gray-100 dark:bg-gray-700 rounded-2xl border border-gray-200 dark:border-gray-600 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentSessionId ? '输入消息...' : '请先选择或创建会话'}
              disabled={!currentSessionId}
              rows={1}
              className="
                flex-1 min-h-12 max-h-50 py-3.5 px-4 pr-14
                bg-transparent border-0 resize-none
                text-gray-900 dark:text-gray-100
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                focus:outline-none focus:ring-0
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />

            {/* 发送/停止按钮 */}
            <div className="absolute right-2 bottom-2">
              {isLoading ? (
                <button
                  onClick={handleInterrupt}
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
                  onClick={handleSubmit}
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
        </div>

        {/* 提示文字 */}
        <div className="mt-2 text-center">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            按 Enter 发送，Shift + Enter 换行
          </span>
        </div>
      </div>
    </div>
  );
};

export default InputArea;
