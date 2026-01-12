import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const SessionList: React.FC = () => {
  const { sessions, currentSessionId, setCurrentSessionId, deleteSession, renameSession } =
    useSessionStore();
  const { loadMessages, clearSessionCache } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) return;

    setCurrentSessionId(sessionId);

    // 从主进程加载消息
    await loadMessages(sessionId);
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
              <span
                className="flex-1 text-sm truncate"
                onDoubleClick={() => handleStartRename(session.id, session.name)}
              >
                {session.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => handleDelete(e, session.id, session.name)}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 text-gray-400 hover:text-red-500"
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
