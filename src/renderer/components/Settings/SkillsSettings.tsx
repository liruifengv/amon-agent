import React, { useEffect, useState } from 'react';
import { Sparkles, FolderOpen, RefreshCw, ChevronDown, ChevronRight, AlertCircle, Home, Folder, Download, Check, X, Trash2 } from 'lucide-react';
import type { SkillsLoadResult, Skill, WorkspaceSkills, RecommendedSkill, Workspace, SkillInstallTarget } from '../../types';
import { useSettingsStore } from '../../store/settingsStore';

type TabType = 'installed' | 'recommended';

// 安装目标选择对话框
interface InstallDialogProps {
  skill: RecommendedSkill;
  workspaces: Workspace[];
  onInstall: (target: SkillInstallTarget, workspacePath?: string) => void;
  onClose: () => void;
}

const InstallDialog: React.FC<InstallDialogProps> = ({ skill, workspaces, onInstall, onClose }) => {
  const [selectedTarget, setSelectedTarget] = useState<'system' | string>('system');

  const handleInstall = () => {
    if (selectedTarget === 'system') {
      onInstall('system');
    } else {
      onInstall('workspace', selectedTarget);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
            安装 {skill.metadata.name}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            安装位置
          </label>
          <select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                       outline-none transition-colors"
          >
            <option value="system">系统级 (~/.claude/skills)</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.path}>
                {ws.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {selectedTarget === 'system'
              ? '系统级 Skills 对所有会话可用'
              : '工作空间 Skills 仅在该工作空间内可用'}
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400
                       hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 text-sm text-white
                       bg-primary-500 rounded-lg
                       hover:bg-primary-600 transition-colors
                       flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            安装
          </button>
        </div>
      </div>
    </div>
  );
};

const SkillsSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('installed');
  const [skillsData, setSkillsData] = useState<SkillsLoadResult | null>(null);
  const [recommendedSkills, setRecommendedSkills] = useState<RecommendedSkill[]>([]);
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(true);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['system']));
  const [installDialog, setInstallDialog] = useState<RecommendedSkill | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const { settings } = useSettingsStore();
  const workspaces = settings?.workspaces || [];

  // 加载已安装的 skills
  const loadInstalledSkills = async () => {
    setIsLoadingInstalled(true);
    try {
      const installed = await window.electronAPI.skills.load();
      setSkillsData(installed);
      const sections = new Set<string>();
      if (installed.systemSkills.length > 0) sections.add('system');
      installed.workspaceSkills.forEach(ws => {
        if (ws.skills.length > 0) sections.add(ws.workspacePath);
      });
      setExpandedSections(sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoadingInstalled(false);
    }
  };

  // 加载推荐的 skills（异步，不阻塞）
  const loadRecommendedSkills = async () => {
    setIsLoadingRecommended(true);
    try {
      const recommended = await window.electronAPI.skills.listRecommended();
      setRecommendedSkills(recommended);
    } catch (err) {
      console.error('Failed to load recommended skills:', err);
    } finally {
      setIsLoadingRecommended(false);
    }
  };

  // 刷新所有
  const refreshAll = async () => {
    setError(null);
    await Promise.all([loadInstalledSkills(), loadRecommendedSkills()]);
  };

  useEffect(() => {
    // 先加载已安装的
    loadInstalledSkills();
    // 异步加载推荐的
    loadRecommendedSkills();
  }, []);

  const handleInstall = async (skill: RecommendedSkill, target: SkillInstallTarget, workspacePath?: string) => {
    setInstallDialog(null);
    setInstalling(skill.id);
    try {
      const result = await window.electronAPI.skills.install(skill.id, target, workspacePath);
      if (result.success) {
        // 重新加载列表
        await refreshAll();
      } else {
        setError(result.error || '安装失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '安装失败');
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (skill: Skill) => {
    // 确认卸载
    const confirmed = await window.electronAPI.dialog.confirm({
      title: '卸载 Skill',
      message: `确定要卸载 ${skill.metadata.name} 吗？`,
      detail: '此操作将删除该 Skill 的所有文件。',
    });

    if (!confirmed.confirmed) return;

    setUninstalling(skill.id);
    try {
      const result = await window.electronAPI.skills.uninstall(skill.path);
      if (result.success) {
        await refreshAll();
      } else {
        setError(result.error || '卸载失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '卸载失败');
    } finally {
      setUninstalling(null);
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleOpenSkillFolder = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await window.electronAPI.shell.openPath(path);
  };

  const formatPath = (path: string) => {
    const home = '/Users/';
    if (path.startsWith(home)) {
      const afterHome = path.slice(home.length);
      const username = afterHome.split('/')[0];
      return path.replace(`${home}${username}`, '~');
    }
    return path;
  };

  const renderSkillCard = (skill: Skill) => (
    <div
      key={skill.id}
      className="flex flex-col p-4 rounded-xl
                 border-2 border-gray-200 dark:border-gray-600
                 text-gray-500 dark:text-gray-400
                 transition-all duration-150 h-full"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center
                        bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <Sparkles className="w-4 h-4 text-primary-500" />
        </div>
        <div className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate flex-1">
          {skill.metadata.name}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1">
        {skill.metadata.description}
      </p>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={(e) => handleOpenSkillFolder(e, skill.path)}
          className="text-xs text-gray-400 dark:text-gray-500 truncate flex items-center gap-1
                     hover:text-primary-500 transition-colors"
          title="打开文件夹"
        >
          <FolderOpen className="w-3 h-3 flex-shrink-0" />
          <span className="truncate max-w-[120px]">{formatPath(skill.path)}</span>
        </button>
        <button
          onClick={() => handleUninstall(skill)}
          disabled={uninstalling === skill.id}
          className="flex items-center gap-1 px-2 py-1 text-xs
                     text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                     rounded transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          title="卸载"
        >
          {uninstalling === skill.id ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      </div>
    </div>
  );

  const renderRecommendedCard = (skill: RecommendedSkill) => (
    <div
      key={skill.id}
      className="flex flex-col p-4 rounded-xl
                 border-2 border-gray-200 dark:border-gray-600
                 text-gray-500 dark:text-gray-400
                 transition-all duration-150 h-full"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center
                        bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <Sparkles className="w-4 h-4 text-primary-500" />
        </div>
        <div className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate flex-1">
          {skill.metadata.name}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1">
        {skill.metadata.description}
      </p>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        {skill.installed ? (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            <span>
              已安装到{skill.installedAt === 'system' ? '系统' : skill.installedWorkspace}
            </span>
          </div>
        ) : (
          <button
            onClick={() => setInstallDialog(skill)}
            disabled={installing === skill.id}
            className="flex items-center gap-2 px-3 py-1.5 text-xs
                       text-white bg-primary-500 rounded-lg
                       hover:bg-primary-600 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {installing === skill.id ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                安装中...
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                安装
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  const renderSection = (
    title: string,
    sectionId: string,
    skills: Skill[],
    icon: React.ReactNode,
    subtitle?: string,
    skillsPath?: string
  ) => {
    const isExpanded = expandedSections.has(sectionId);

    const handleOpenFolder = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (skillsPath) {
        await window.electronAPI.shell.openPath(skillsPath);
      }
    };

    return (
      <div key={sectionId}>
        <button
          onClick={() => toggleSection(sectionId)}
          className="w-full flex items-center gap-3 p-3 rounded-lg
                     hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="text-gray-400">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          {icon}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {title}
              </span>
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700
                             text-gray-500 dark:text-gray-400 rounded">
                {skills.length}
              </span>
            </div>
            {subtitle && skills.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5">
                <span>{subtitle}</span>
                {skillsPath && (
                  <span
                    onClick={handleOpenFolder}
                    className="inline-flex items-center text-gray-400 hover:text-primary-500 transition-colors"
                    title="打开文件夹"
                  >
                    <Folder className="w-3 h-3" />
                  </span>
                )}
              </p>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-3 ml-7">
            {skills.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500
                              bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无 Skills</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {skills.map(renderSkillCard)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="w-6 h-6 text-red-500 mb-3" />
        <p className="text-sm text-red-500 mb-4">{error}</p>
        <button
          onClick={refreshAll}
          className="flex items-center gap-2 px-4 py-2 text-sm
                     bg-primary-500 text-white rounded-lg
                     hover:bg-primary-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </button>
      </div>
    );
  }

  const totalInstalledSkills = (skillsData?.systemSkills.length || 0) +
    (skillsData?.workspaceSkills.reduce((acc, ws) => acc + ws.skills.length, 0) || 0);

  return (
    <div className="space-y-6">
      {/* 说明 */}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Skills 是包含 SKILL.md 文件的文件夹，用于扩展 Claude 的能力。
          系统级 Skills 位于 ~/.claude/skills，工作空间 Skills 位于各工作空间的 .claude/skills 目录。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
        <button
          onClick={() => setActiveTab('installed')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
            ${activeTab === 'installed'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
        >
          <FolderOpen className="w-4 h-4" />
          已安装 ({totalInstalledSkills})
        </button>
        <button
          onClick={() => setActiveTab('recommended')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
            ${activeTab === 'recommended'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
        >
          <Download className="w-4 h-4" />
          推荐 ({recommendedSkills.length})
        </button>
      </div>

      {/* 已安装 Tab */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          {/* 头部 */}
          <div className="flex items-center justify-end">
            <button
              onClick={loadInstalledSkills}
              disabled={isLoadingInstalled}
              className="flex items-center gap-2 px-3 py-1.5 text-sm
                         text-gray-600 dark:text-gray-400
                         bg-gray-100 dark:bg-gray-700 rounded-lg
                         hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors
                         disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingInstalled ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* Skills 列表 */}
          {isLoadingInstalled ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-primary-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
            {renderSection(
              '系统 Skills',
              'system',
              skillsData?.systemSkills || [],
              <Home className="w-5 h-5 text-gray-400" />,
              '~/.claude/skills',
              '~/.claude/skills'
            )}

            {skillsData?.workspaceSkills.map((ws: WorkspaceSkills) =>
              renderSection(
                ws.workspaceName,
                ws.workspacePath,
                ws.skills,
                <FolderOpen className="w-5 h-5 text-primary-500" />,
                `${formatPath(ws.workspacePath)}/.claude/skills`,
                `${ws.workspacePath}/.claude/skills`
              )
            )}
            </div>
          )}
        </div>
      )}

      {/* 推荐 Tab */}
      {activeTab === 'recommended' && (
        <div className="space-y-4">
          {/* 头部 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              官方推荐的 Skills，点击安装按钮添加到您的系统或工作空间
            </p>
            <button
              onClick={loadRecommendedSkills}
              disabled={isLoadingRecommended}
              className="flex items-center gap-2 px-3 py-1.5 text-sm
                         text-gray-600 dark:text-gray-400
                         bg-gray-100 dark:bg-gray-700 rounded-lg
                         hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors
                         disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingRecommended ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* 推荐 Skills 网格 */}
          {isLoadingRecommended ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-primary-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">从网络加载中...</p>
            </div>
          ) : recommendedSkills.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500
                            bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">暂无推荐的 Skills</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendedSkills.map(renderRecommendedCard)}
            </div>
          )}
        </div>
      )}

      {/* 安装对话框 */}
      {installDialog && (
        <InstallDialog
          skill={installDialog}
          workspaces={workspaces}
          onInstall={(target, workspacePath) => handleInstall(installDialog, target, workspacePath)}
          onClose={() => setInstallDialog(null)}
        />
      )}
    </div>
  );
};

export default SkillsSettings;
