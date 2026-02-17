import React from 'react';

// Color variants (multi-color SVG, theme-safe)
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color';
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color';
import MistralColor from '@lobehub/icons/es/Mistral/components/Color';
import TogetherColor from '@lobehub/icons/es/Together/components/Color';
import SiliconCloudColor from '@lobehub/icons/es/SiliconCloud/components/Color';

// Mono variants (use brand color for tinting)
import AnthropicMono from '@lobehub/icons/es/Anthropic/components/Mono';
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono';
import GroqMono from '@lobehub/icons/es/Groq/components/Mono';
import OpenRouterMono from '@lobehub/icons/es/OpenRouter/components/Mono';
import GrokMono from '@lobehub/icons/es/Grok/components/Mono';

interface ProviderIconProps {
  icon: string;
  size?: number;
}

// Icons that have a native Color variant
const COLOR_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  DeepSeek: DeepSeekColor,
  Gemini: GeminiColor,
  Mistral: MistralColor,
  Together: TogetherColor,
  SiliconCloud: SiliconCloudColor,
};

// Icons that only have Mono, paired with their brand color
const MONO_ICONS: Record<string, { component: React.ComponentType<{ size?: number }>; color: string }> = {
  Anthropic: { component: AnthropicMono, color: '#D97757' },
  OpenAI: { component: OpenAIMono, color: '#10A37F' },
  Groq: { component: GroqMono, color: '#F55036' },
  OpenRouter: { component: OpenRouterMono, color: '#6566F1' },
  Grok: { component: GrokMono, color: '#FF6A00' },
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
      <span style={{ color: mono.color }} className="inline-flex">
        <MonoIcon size={size} />
      </span>
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded bg-muted text-muted-foreground text-xs font-medium"
      style={{ width: size, height: size }}
    >
      {icon.charAt(0).toUpperCase()}
    </div>
  );
};

export default ProviderIcon;
