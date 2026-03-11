import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeft, RefreshCw } from 'lucide-react';
import { useSkillsStore } from '../../store/skillsStore';
import { useSessionStore } from '../../store/sessionStore';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import SkillCard from './SkillCard';
import SkillDetailDialog from './SkillDetailDialog';
import type { SkillInfo, BuiltinSkillMeta } from '../../../shared/types';

interface SkillsViewProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

const SkillsView: React.FC<SkillsViewProps> = ({ sidebarCollapsed, onToggleSidebar }) => {
  const { t } = useTranslation('skills');
  const {
    installed,
    builtin,
    isLoading,
    pendingAction,
    loadSkills,
    installSkill,
    uninstallSkill,
    toggleDisable,
  } = useSkillsStore();
  const getCurrentWorkspace = useSessionStore(s => s.getCurrentWorkspace);

  // Detail dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<'installed' | 'recommended'>('installed');

  // Derive selected skill from store so it stays in sync
  const selectedSkill = useMemo(() => {
    if (!selectedSkillName) return null;
    if (detailMode === 'installed') {
      const found = installed.find(s => s.name === selectedSkillName);
      if (found) return { name: found.name, description: found.description, dirPath: found.dirPath, source: found.source, disabled: found.disabled };
    }
    if (detailMode === 'recommended') {
      const found = builtin.find(b => b.name === selectedSkillName);
      if (found) return { name: found.name, description: found.description, dirPath: found.dirPath, disabled: false };
    }
    return null;
  }, [selectedSkillName, detailMode, installed, builtin]);

  // Load skills on mount
  useEffect(() => {
    const workspace = getCurrentWorkspace();
    loadSkills(workspace);
  }, [loadSkills, getCurrentWorkspace]);

  // Recommended = builtin skills not yet installed
  const recommended = useMemo(() => {
    return builtin.filter(b => !b.installed && !installed.some(i => i.name === b.name));
  }, [builtin, installed]);

  const handleInstalledCardClick = (skill: SkillInfo) => {
    setSelectedSkillName(skill.name);
    setDetailMode('installed');
    setDetailOpen(true);
  };

  const handleRecommendedCardClick = (skill: BuiltinSkillMeta) => {
    setSelectedSkillName(skill.name);
    setDetailMode('recommended');
    setDetailOpen(true);
  };

  const handleRefresh = () => {
    const workspace = getCurrentWorkspace();
    loadSkills(workspace);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        {/* Header */}
        <div className="h-14 drag-region flex items-center px-4 shrink-0">
          {sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="no-drag h-8 w-8 ml-16"
              title={t('expandSidebar', { ns: 'chat' })}
            >
              <PanelLeft className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          <div className="flex-1 flex items-center justify-center">
            <h2 className="text-sm font-medium text-foreground">{t('title')}</h2>
          </div>
          {sidebarCollapsed && <div className="w-8 h-8 ml-16" />}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 drag-region flex items-center px-4 shrink-0">
        {sidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="no-drag h-8 w-8 ml-16"
            title={t('expandSidebar', { ns: 'chat' })}
          >
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
        <div className="flex-1 flex items-center justify-center">
          <h2 className="text-sm font-medium text-foreground">{t('title')}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          className="no-drag h-8 w-8"
          title={t('refresh')}
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </Button>
        {sidebarCollapsed && <div className="w-16 h-8" />}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

      {/* Installed section */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          {t('installed')} ({installed.length})
        </h2>
        {installed.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('noInstalledSkills')}
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {installed.map(skill => (
              <SkillCard
                key={skill.name}
                name={skill.name}
                description={skill.description}
                sourceLabel={skill.sourceLabel}
                disabled={skill.disabled}
                mode="installed"
                isPending={pendingAction === skill.name}
                onToggleDisable={(disabled) => toggleDisable(skill.name, disabled)}
                onClick={() => handleInstalledCardClick(skill)}
              />
            ))}
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {/* Recommended section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          {t('recommended')}
        </h2>
        {recommended.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('noRecommendedSkills')}
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {recommended.map(skill => (
              <SkillCard
                key={skill.name}
                name={skill.name}
                description={skill.description}
                mode="recommended"
                isPending={pendingAction === skill.name}
                onInstall={() => installSkill(skill.name)}
                onClick={() => handleRecommendedCardClick(skill)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {selectedSkill && (
        <SkillDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          skill={selectedSkill}
          mode={detailMode}
          onInstall={() => installSkill(selectedSkill.name)}
          onUninstall={() => uninstallSkill(selectedSkill.name)}
          onToggleDisable={(disabled) => toggleDisable(selectedSkill.name, disabled)}
        />
      )}
      </div>
    </div>
  );
};

export default SkillsView;
