export interface ProviderPreset {
  id: string;
  name: string;
  type: 'anthropic' | 'openai';
  icon: string;
  defaultBaseUrl?: string;
  defaultModels: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'claude',
    name: 'Anthropic Claude',
    type: 'anthropic',
    icon: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModels: ['claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    icon: 'OpenAI',
    defaultModels: ['gpt-5.2', 'gpt-5.3'],
  },
  {
    id: 'glm',
    name: 'GLM',
    type: 'anthropic',
    icon: 'ZAI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModels: ['glm-5', 'glm-4.7'],
  },
  {
    id: 'glm-en',
    name: 'GLM (EN)',
    type: 'anthropic',
    icon: 'ZAI',
    defaultBaseUrl: 'https://api.z.ai/api/anthropic',
    defaultModels: ['glm-5', 'glm-4.7'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    type: 'anthropic',
    icon: 'Minimax',
    defaultBaseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModels: ['MiniMax-M2.5', 'MiniMax-M2.1'],
  },
  {
    id: 'minimax-en',
    name: 'MiniMax (EN)',
    type: 'anthropic',
    icon: 'Minimax',
    defaultBaseUrl: 'https://api.minimax.io/anthropic',
    defaultModels: ['MiniMax-M2.5', 'MiniMax-M2.1'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    type: 'anthropic',
    icon: 'Kimi',
    defaultBaseUrl: 'https://api.kimi.com/coding',
    defaultModels: ['kimi-for-coding'],
  },
];
