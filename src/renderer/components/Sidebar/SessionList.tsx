import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import i18n from '../../i18n';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { confirm } from '../../store/confirmStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

/**
 * 格式化时间显示
 * - 今天: 显示时间 (如 14:30)
 * - 昨天: 显示 "Yesterday" / "昨天"
 * - 今年内: 显示月日 (如 3/15)
 * - 更早: 显示年月日 (如 2024/3/15)
 */
function formatTime(timestamp: number, yesterdayLabel: string): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';

  if (isToday) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (isYesterday) {
    return yesterdayLabel;
  } else if (isThisYear) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } else {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
}

interface SessionListProps {
  onSelectSession?: () => void;
}

const SessionList: React.FC<SessionListProps> = ({ onSelectSession }) => {
  const { t } = useTranslation('sidebar');
  const { sessions, currentSessionId, setCurrentSessionId, deleteSession, renameSession } =
    useSessionStore();
  const { loadMessages, clearSessionCache } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      // Even if same session, trigger navigation back to chat view
      onSelectSession?.();
      return;
    }

    // 先加载消息，再切换会话，避免闪烁
    await loadMessages(sessionId);
    setCurrentSessionId(sessionId);
    onSelectSession?.();
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
    const confirmed = await confirm({
      title: t('deleteSession'),
      message: t('confirmDeleteSession', { name }),
    });
    if (confirmed) {
      await deleteSession(id);
      // 清除该会话的缓存
      clearSessionCache(id);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        {t('noSessions')}
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
                ? 'bg-sidebar-accent text-foreground'
                : 'hover:bg-sidebar-accent text-foreground'
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
                  onDoubleClick={() => handleStartRename(session.id, session.title)}
                >
                  {session.title}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {formatTime(session.updatedAt, t('yesterday'))}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => handleDelete(e, session.id, session.title)}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                title={t('deleteSession')}
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
