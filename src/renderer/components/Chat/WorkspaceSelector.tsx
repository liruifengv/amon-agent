import React from 'react';
import { FolderOpen, Plus, Check, AlertCircle, Home } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useChatStore } from '../../store/chatStore';
import type { Workspace } from '../../types';

// 系统默认工作空间
const SYSTEM_DEFAULT_WORKSPACE = '~/.amon/workspace';

interface WorkspaceSelectorProps {
  sessionId: string;
  currentWorkspace?: string;
  onClose: () => void;
}

const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  sessionId,
  currentWorkspace,
  onClose,
}) => {
  const { updateSessionWorkspace } = useSessionStore();
  const { settings, setFormData, saveSettings } = useSettingsStore();
  const sessionMessages = useChatStore((state) => state.sessionMessages);
  const messages = sessionMessages[sessionId] || [];

  const workspaces = settings.workspaces || [];
  const hasMessages = messages.length > 0;

  // 格式化路径显示
  const formatPath = (path: string) => {
    const home = '/Users/';
    if (path.startsWith(home)) {
      const afterHome = path.slice(home.length);
      const username = afterHome.split('/')[0];
      return path.replace(`${home}${username}`, '~');
    }
    return path;
  };

  const handleSelectWorkspace = async (workspace: Workspace) => {
    if (hasMessages) return;
    await updateSessionWorkspace(sessionId, workspace.path);
    onClose();
  };

  const handleSelectDefaultWorkspace = async () => {
    if (hasMessages) return;
    await updateSessionWorkspace(sessionId, SYSTEM_DEFAULT_WORKSPACE);
    onClose();
  };

  const handleAddNewWorkspace = async () => {
    const result = await window.electronAPI.dialog.selectFolder();
    if (result.success && result.path) {
      // 检查是否已存在相同路径的工作空间
      const existingWorkspace = workspaces.find(w => w.path === result.path);
      if (existingWorkspace) {
        // 已存在，直接应用到当前会话
        if (!hasMessages) {
          await updateSessionWorkspace(sessionId, result.path);
        }
        onClose();
        return;
      }

      // 添加到保存的工作空间列表
      const name = result.path.split('/').filter(Boolean).pop() || 'workspace';
      const newWorkspace: Workspace = {
        id: crypto.randomUUID(),
        name,
        path: result.path,
        isDefault: workspaces.length === 0,
      };

      // 更新设置
      const updatedWorkspaces = [...workspaces, newWorkspace];
      setFormData({ workspaces: updatedWorkspaces });
      await saveSettings();

      // 如果没有消息，应用到当前会话
      if (!hasMessages) {
        await updateSessionWorkspace(sessionId, result.path);
      }
      onClose();
    }
  };

  return (
    <>
      {/* 遮罩层 - 点击关闭 */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 mt-2
                   bg-white dark:bg-gray-800 rounded-lg shadow-lg
                   border border-gray-200 dark:border-gray-700
                   z-50 min-w-[280px] max-w-[320px] overflow-hidden"
      >
      {/* 警告提示 */}
      {hasMessages && (
        <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400
                        bg-amber-50 dark:bg-amber-900/20
                        border-b border-amber-200 dark:border-amber-800
                        flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>对话开始后无法更换工作空间</span>
        </div>
      )}

      {/* 工作空间列表 */}
      <div className="max-h-[240px] overflow-y-auto p-1">
        {/* 默认工作空间 */}
        <button
          onClick={handleSelectDefaultWorkspace}
          disabled={hasMessages}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors text-left
                      ${hasMessages
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                      ${currentWorkspace === SYSTEM_DEFAULT_WORKSPACE
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : ''}`}
        >
          <Home className={`w-4 h-4 flex-shrink-0
            ${currentWorkspace === SYSTEM_DEFAULT_WORKSPACE ? 'text-primary-500' : 'text-gray-400'}`}
          />
          <div className="flex-1 min-w-0">
            <div className={`font-medium truncate
              ${currentWorkspace === SYSTEM_DEFAULT_WORKSPACE
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-700 dark:text-gray-200'}`}
            >
              默认目录
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {SYSTEM_DEFAULT_WORKSPACE}
            </div>
          </div>
          {currentWorkspace === SYSTEM_DEFAULT_WORKSPACE && (
            <Check className="w-4 h-4 text-primary-500 flex-shrink-0" />
          )}
        </button>

        {/* 分隔线 */}
        {workspaces.length > 0 && (
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
        )}

        {/* 用户工作空间列表 */}
        {workspaces.length > 0 && (
          <div className="space-y-0.5">
            {workspaces.map((workspace) => {
              const isSelected = currentWorkspace === workspace.path;
              return (
                <button
                  key={workspace.id}
                  onClick={() => handleSelectWorkspace(workspace)}
                  disabled={hasMessages}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                              transition-colors text-left
                              ${hasMessages
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                              ${isSelected
                                ? 'bg-primary-50 dark:bg-primary-900/20'
                                : ''}`}
                >
                  <FolderOpen className={`w-4 h-4 flex-shrink-0
                    ${isSelected ? 'text-primary-500' : 'text-gray-400'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate
                      ${isSelected
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-200'}`}
                    >
                      {workspace.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {formatPath(workspace.path)}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary-500 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

        {/* 添加新工作空间 */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-1">
          <button
            onClick={handleAddNewWorkspace}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm
                       text-primary-600 dark:text-primary-400
                       hover:bg-primary-50 dark:hover:bg-primary-900/20
                       transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加新工作空间
          </button>
        </div>
      </div>
    </>
  );
};

export default WorkspaceSelector;
