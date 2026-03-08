import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import SkillIcon from './SkillIcon';

interface SkillCardProps {
  name: string;
  description: string;
  sourceLabel?: string;
  disabled?: boolean;
  mode: 'installed' | 'recommended';
  isPending?: boolean;
  onToggleDisable?: (disabled: boolean) => void;
  onInstall?: () => void;
  onClick?: () => void;
}

const SkillCard: React.FC<SkillCardProps> = ({
  name,
  description,
  sourceLabel,
  disabled,
  mode,
  isPending,
  onToggleDisable,
  onInstall,
  onClick,
}) => {
  const { t } = useTranslation('skills');

  return (
    <div
      onClick={onClick}
      className="group flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-accent/50 cursor-pointer transition-colors"
    >
      <SkillIcon name={name} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{name}</span>
          {mode === 'installed' && sourceLabel && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              {sourceLabel === 'global' ? t('sourceGlobal') : sourceLabel}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {description}
        </p>
      </div>

      {mode === 'installed' && onToggleDisable && (
        <div
          className="shrink-0 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={!disabled}
            onCheckedChange={(checked) => onToggleDisable(!checked)}
          />
        </div>
      )}

      {mode === 'recommended' && (
        <div className="shrink-0 pt-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInstall?.();
                  }}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('installSkill')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default SkillCard;
