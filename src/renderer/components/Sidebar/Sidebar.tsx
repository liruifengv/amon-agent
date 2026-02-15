import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, PanelLeftClose } from 'lucide-react';
import { Button } from '../ui/button';
import SessionList from './SessionList';
import NewSessionButton from './NewSessionButton';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { t } = useTranslation('sidebar');
  const handleOpenSettings = () => {
    window.electronAPI.window.openSettings();
  };

  return (
    <div
      className={`
        h-full bg-sidebar-background
        flex flex-col overflow-hidden transition-all duration-300 ease-in-out
        ${collapsed ? 'w-0' : 'w-56'}
      `}
    >
      {/* 内容容器 - 固定宽度防止内容压缩 */}
      <div className="w-56 h-full flex flex-col shrink-0">
        {/* 头部 - 拖拽区域，为红绿灯按钮留出空间 */}
        <div className="h-12 drag-region flex items-center justify-end gap-1 px-2 pl-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="no-drag h-8 w-8"
            title={t('collapseSidebar')}
          >
            <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
          </Button>
          <div className="no-drag">
            <NewSessionButton />
          </div>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto">
          <SessionList />
        </div>

        {/* 底部设置按钮 */}
        <div className="p-3">
          <Button
            variant="ghost"
            onClick={handleOpenSettings}
            className="w-full justify-start gap-2 text-foreground"
          >
            <Settings className="h-4 w-4" />
            <span>{t('settings')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
