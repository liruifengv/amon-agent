import React from 'react';
import { cn } from '../../lib/utils';

const COLORS = [
  'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  'bg-green-500/20 text-green-600 dark:text-green-400',
  'bg-purple-500/20 text-purple-600 dark:text-purple-400',
  'bg-orange-500/20 text-orange-600 dark:text-orange-400',
  'bg-pink-500/20 text-pink-600 dark:text-pink-400',
  'bg-teal-500/20 text-teal-600 dark:text-teal-400',
  'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
  'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
  'bg-rose-500/20 text-rose-600 dark:text-rose-400',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface SkillIconProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SkillIcon: React.FC<SkillIconProps> = ({ name, size = 'md' }) => {
  const colorIndex = hashName(name) % COLORS.length;
  const colorClass = COLORS[colorIndex];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg font-semibold shrink-0',
        colorClass,
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-12 w-12 text-lg',
      )}
    >
      {initial}
    </div>
  );
};

export default SkillIcon;
