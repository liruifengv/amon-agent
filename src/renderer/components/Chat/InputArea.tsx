import React, { useState, useRef, useEffect } from 'react';
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

  const canSend = !!(input.trim() && currentSessionId && !isLoading);

  return (
    <div className="bg-gray-50 dark:bg-gray-900 px-4 pb-4">
      <div className="max-w-3xl mx-auto">
        {/* 输入框容器 */}
        <div className="flex flex-col bg-gray-100 dark:bg-gray-700 rounded-2xl border border-gray-200 dark:border-gray-600 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentSessionId ? '向 Amon 提问...' : '请先选择或创建会话'}
            disabled={!currentSessionId}
            rows={1}
            className="
              min-h-24 w-full py-3 px-4
              bg-transparent border-0 resize-none
              text-gray-900 dark:text-gray-100
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:outline-none focus:ring-0
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />

          {/* 底部工具栏 */}
          <InputToolbar
            isLoading={isLoading}
            canSend={canSend}
            onSend={handleSubmit}
            onStop={handleInterrupt}
          />
        </div>
      </div>
    </div>
  );
};

export default InputArea;
