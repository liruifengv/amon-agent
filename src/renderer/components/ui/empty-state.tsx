import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg',
        className
      )}
    >
      <Icon className="w-10 h-10 mx-auto mb-2 opacity-50" />
      <p className="text-sm">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';

export { EmptyState };
