import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileInfo } from '../../../types';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';

interface FileMentionPopoverProps {
  isOpen: boolean;
  files: FileInfo[];
  isLoading: boolean;
  selectedIndex: number;
  position: { top: number; left: number } | null;
  onSelect: (file: FileInfo) => void;
  onClose: () => void;
}

const FileMentionPopover: React.FC<FileMentionPopoverProps> = ({
  isOpen,
  files,
  isLoading,
  selectedIndex,
  position,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation('chat');
  const listRef = useRef<HTMLDivElement>(null);

  // 自动滚动到选中项
  useEffect(() => {
    if (listRef.current && files.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, files.length]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  return (
    <div
      className="fixed z-50 min-w-[280px] max-w-[400px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{
        top: position.top - 8,
        left: position.left,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="p-1.5 text-xs text-muted-foreground border-b border-border">
        {t('fileMention.selectFile')}
      </div>
      <div
        ref={listRef}
        className="max-h-[240px] overflow-y-auto p-1"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">{t('fileMention.searching')}</span>
          </div>
        ) : files.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {t('fileMention.noFilesFound')}
          </div>
        ) : (
          files.map((file, index) => (
            <div
              key={file.path}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm',
                'hover:bg-accent hover:text-accent-foreground',
                index === selectedIndex && 'bg-accent text-accent-foreground'
              )}
              onClick={() => onSelect(file)}
              onMouseEnter={() => {
                // 可选：鼠标悬停时更新选中项
              }}
            >
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{file.path}</span>
            </div>
          ))
        )}
      </div>
      <div className="p-1.5 text-xs text-muted-foreground border-t border-border flex gap-2">
        <span><kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> {t('fileMention.select')}</span>
        <span><kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> {t('fileMention.confirm')}</span>
        <span><kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> {t('fileMention.cancel')}</span>
      </div>
    </div>
  );
};

export default FileMentionPopover;
