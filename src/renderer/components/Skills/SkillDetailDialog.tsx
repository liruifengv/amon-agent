import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { useSkillsStore } from '../../store/skillsStore';
import { confirm } from '../../store/confirmStore';
import SkillIcon from './SkillIcon';
import type { SkillSource } from '../../../shared/types';

interface SkillDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: {
    name: string;
    description: string;
    dirPath: string;
    source?: SkillSource;
    disabled?: boolean;
  };
  mode: 'installed' | 'recommended';
  onInstall?: () => void;
  onUninstall?: () => void;
  onToggleDisable?: (disabled: boolean) => void;
}

/** Strip YAML frontmatter (between --- markers) from markdown content */
function stripFrontmatter(content: string): string {
  const text = content.replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return text;
  const endIndex = text.indexOf('\n---', 3);
  if (endIndex === -1) return text;
  return text.slice(endIndex + 4).trim();
}

const SkillDetailDialog: React.FC<SkillDetailDialogProps> = ({
  open,
  onOpenChange,
  skill,
  mode,
  onInstall,
  onUninstall,
  onToggleDisable,
}) => {
  const { t } = useTranslation('skills');
  const { getSkillContent, openFolder, pendingAction } = useSkillsStore();
  const [content, setContent] = useState<string>('');
  const [loadedSkill, setLoadedSkill] = useState<string>('');

  useEffect(() => {
    if (!open || !skill.dirPath) {
      return;
    }
    if (skill.dirPath === loadedSkill) {
      return;
    }
    setContent('');
    getSkillContent(skill.dirPath).then((raw) => {
      setContent(stripFrontmatter(raw));
      setLoadedSkill(skill.dirPath);
    }).catch(() => {
      setContent('');
      setLoadedSkill(skill.dirPath);
    });
  }, [open, skill.dirPath, loadedSkill, getSkillContent]);

  useEffect(() => {
    if (!open) {
      setLoadedSkill('');
    }
  }, [open]);

  const handleUninstall = async () => {
    const confirmed = await confirm({
      title: t('uninstallSkill'),
      message: t('confirmUninstall', { name: skill.name }),
    });
    if (confirmed) {
      onUninstall?.();
      onOpenChange(false);
    }
  };

  const handleOpenFolder = () => {
    openFolder(skill.dirPath);
  };

  const isPending = pendingAction === skill.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-6">
        {/* Icon */}
        <div className="mb-3">
          <SkillIcon name={skill.name} size="lg" />
        </div>

        {/* Title + Open Folder */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-semibold">{skill.name}</h2>
          {mode === 'installed' && (
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {t('openFolder')}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4">
          {skill.description}
        </p>

        {/* Markdown Content */}
        <div className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto border border-border/50 rounded-lg bg-muted/20">
          {content ? (
            <div className="p-5 text-sm text-foreground leading-relaxed [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-0.5 [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:my-2 [&_pre]:overflow-x-auto [&_a]:text-primary [&_a]:underline">
              <Markdown>{content}</Markdown>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 mt-4">
          {mode === 'installed' && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleUninstall}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : null}
                {t('uninstall')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleDisable?.(!skill.disabled)}
              >
                {skill.disabled ? t('enable') : t('disable')}
              </Button>
            </>
          )}
          {mode === 'recommended' && (
            <Button
              size="sm"
              onClick={() => {
                onInstall?.();
                onOpenChange(false);
              }}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : null}
              {t('install')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SkillDetailDialog;
