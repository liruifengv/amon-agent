import * as React from 'react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CollapsibleProps {
  children: React.ReactNode;
  title: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  icon?: React.ReactNode;
}

const Collapsible: React.FC<CollapsibleProps> = ({
  children,
  title,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  headerClassName,
  contentClassName,
  icon,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleToggle = () => {
    const newOpen = !isOpen;
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  return (
    <div className={cn('', className)}>
      <button
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-2 w-full text-left',
          'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100',
          'transition-colors',
          headerClassName
        )}
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 transition-transform flex-shrink-0',
            isOpen ? 'rotate-0' : '-rotate-90'
          )}
        />
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="flex-1 min-w-0 truncate">{title}</span>
      </button>

      {isOpen && (
        <div className={cn('mt-2', contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
};

Collapsible.displayName = 'Collapsible';

export { Collapsible };
