import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

/**
 * 格式化时间显示
 * - 今天: 显示时间 (如 14:30)
 * - 昨天: 显示 "昨天"
 * - 今年内: 显示月日 (如 3/15)
 * - 更早: 显示年月日 (如 2024/3/15)
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (isYesterday) {
    return '昨天';
  } else if (isThisYear) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } else {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
}

const SessionList: React.FC = () => {
  const { sessions, currentSessionId, setCurrentSessionId, deleteSession, renameSession } =
    useSessionStore();
  const { loadMessages, clearSessionCache } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) return;

    // 先加载消息，再切换会话，避免闪烁
    await loadMessages(sessionId);
    setCurrentSessionId(sessionId);
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleFinishRename = async (id: string) => {
    if (editName.trim()) {
      await renameSession(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const { confirmed } = await window.electronAPI.dialog.confirm({
      title: '确认删除',
      message: `确定要删除会话 "${name}" 吗？`,
    });
    if (confirmed) {
      await deleteSession(id);
      // 清除该会话的缓存
      clearSessionCache(id);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        暂无会话
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => handleSelectSession(session.id)}
          className={`
            group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer
            transition-colors duration-150
            ${
              session.id === currentSessionId
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }
          `}
        >
          {editingId === session.id ? (
            <Input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleFinishRename(session.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename(session.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-7 text-sm"
              autoFocus
            />
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <span
                  className="block text-sm truncate"
                  onDoubleClick={() => handleStartRename(session.id, session.name)}
                >
                  {session.name}
                </span>
                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatTime(session.updatedAt)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => handleDelete(e, session.id, session.name)}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 text-gray-400 hover:text-red-500 flex-shrink-0"
                title="删除会话"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default SessionList;
