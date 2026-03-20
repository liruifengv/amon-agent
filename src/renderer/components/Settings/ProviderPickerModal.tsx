import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { listConnectionSpecs, type ConnectionSpec } from '@shared/ai-catalog';
import ProviderIcon from './ProviderIcon';
import { getConnectionIcon } from '../../utils/connection-catalog';

interface ProviderPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (spec: ConnectionSpec) => void;
}

const ProviderPickerModal: React.FC<ProviderPickerModalProps> = ({ open, onClose, onSelect }) => {
  const { t } = useTranslation(['settings']);
  const specs = listConnectionSpecs();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background border border-border rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="p-5 grid grid-cols-3 gap-3">
          {specs.map((spec) => (
            <button
              key={spec.id}
              type="button"
              onClick={() => onSelect(spec)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border
                         hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <ProviderIcon icon={getConnectionIcon(spec.id)} size={28} />
              <span className="text-xs font-medium text-foreground text-center">{spec.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProviderPickerModal;
