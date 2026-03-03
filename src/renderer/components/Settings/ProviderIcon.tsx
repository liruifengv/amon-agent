import React from 'react';

// Color variants
import ChatGLMColor from '@lobehub/icons/es/ZAI/components/Mono';
import KimiMono from '@lobehub/icons/es/Kimi/components/Mono';
import MinimaxColor from '@lobehub/icons/es/Minimax/components/Color';
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color';

// Mono variants
import AnthropicMono from '@lobehub/icons/es/Anthropic/components/Mono';
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono';

interface ProviderIconProps {
  icon: string;
  size?: number;
}

const COLOR_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  Minimax: MinimaxColor,
  Gemini: GeminiColor,
};

const MONO_ICONS: Record<string, { component: React.ComponentType<{ size?: number }>; color: string; invertInDark?: boolean }> = {
  Anthropic: { component: AnthropicMono, color: '#D97757' },
  OpenAI: { component: OpenAIMono, color: '#10A37F' },
  ZAI: { component: ChatGLMColor, color: '#000000', invertInDark: true },
  Kimi: { component: KimiMono, color: '#000000', invertInDark: true },
};

const ProviderIcon: React.FC<ProviderIconProps> = ({ icon, size = 20 }) => {
  const ColorIcon = COLOR_ICONS[icon];
  if (ColorIcon) {
    return <ColorIcon size={size} />;
  }

  const mono = MONO_ICONS[icon];
  if (mono) {
    const MonoIcon = mono.component;
    return (
      <span
        style={{ color: mono.color }}
        className={`inline-flex ${mono.invertInDark ? 'dark:invert' : ''}`}
      >
        <MonoIcon size={size} />
      </span>
    );
  }

  // Fallback: 首字母头像
  return (
    <div
      className="flex items-center justify-center rounded bg-primary/15 text-primary text-xs font-bold shrink-0"
      style={{ width: size, height: size }}
    >
      {icon ? icon.charAt(0).toUpperCase() : '?'}
    </div>
  );
};

export default ProviderIcon;
