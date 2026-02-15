import React from 'react';
import { Circle, CheckCircle, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TodoListProps {
  todos: TodoItem[];
}

// 状态配置
const STATUS_CONFIG = {
  pending: {
    icon: <Circle className="w-4 h-4 text-muted-foreground" />,
    text: 'text-muted-foreground',
    bg: '',
  },
  in_progress: {
    icon: (
      <svg className="w-4 h-4 text-info animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    text: 'text-info font-medium',
    bg: 'bg-info/5',
  },
  completed: {
    icon: <CheckCircle className="w-4 h-4 text-success" />,
    text: 'text-muted-foreground line-through',
    bg: '',
  },
};

/**
 * TODO 列表显示组件
 */
const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  const { t } = useTranslation('message');
  if (!todos || todos.length === 0) return null;

  const completedCount = todos.filter(t => t.status === 'completed').length;
  const progress = Math.round((completedCount / todos.length) * 100);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* 头部 */}
      <div className="px-3 py-2 bg-muted border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{t('tasks')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {completedCount}/{todos.length}
            </span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* TODO 列表 */}
      <div className="divide-y divide-border">
        {todos.map((todo, index) => {
          const config = STATUS_CONFIG[todo.status];
          return (
            <div
              key={index}
              className={`flex items-center gap-2.5 px-3 py-2 ${config.bg}`}
            >
              <span className="shrink-0">{config.icon}</span>
              <span className={`text-sm ${config.text}`}>
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodoList;
