import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { PROVIDER_PRESETS, type ProviderPreset } from '@shared/provider-presets';
import ProviderIcon from './ProviderIcon';

interface ProviderPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (preset: ProviderPreset) => void;
}

const ProviderPickerModal: React.FC<ProviderPickerModalProps> = ({ open, onClose, onSelect }) => {
  const { t } = useTranslation(['settings']);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background border border-border rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            {t('settings:provider.selectProvider')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid */}
        <div className="p-5 grid grid-cols-3 gap-3">
          {PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border
                         hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <ProviderIcon icon={preset.icon} size={28} />
              <span className="text-xs font-medium text-foreground">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProviderPickerModal;
