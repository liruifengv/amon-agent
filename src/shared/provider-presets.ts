import type { ProviderAuthConfig } from './provider-auth';

export interface ProviderPreset {
  id: string;
  name: string;
  apiType: string;   // Api identifier: 'anthropic-messages' | 'openai-completions' | 'openai-responses' | 'google-generative-ai'
  provider: string;  // Provider identifier: 'anthropic' | 'openai' | 'google' | ...
  icon: string;
  defaultBaseUrl?: string;
  defaultModels: string[];
  auth: ProviderAuthConfig;
  editableBaseUrl?: boolean;
  editableApiKey?: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'claude',
    name: 'Anthropic Claude',
    apiType: 'anthropic-messages',
    provider: 'anthropic',
    icon: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModels: ['claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiType: 'openai-completions',
    provider: 'openai',
    icon: 'OpenAI',
    defaultModels: ['gpt-5.2', 'gpt-5.3-codex', 'gpt-5.4'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'openai-responses',
    name: 'OpenAI Responses',
    apiType: 'openai-responses',
    provider: 'openai',
    icon: 'OpenAI',
    defaultModels: ['gpt-5.2', 'gpt-5.3-codex', 'gpt-5.4'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'codex',
    name: 'Codex',
    apiType: 'openai-codex-responses',
    provider: 'openai-codex',
    icon: 'OpenAI',
    defaultBaseUrl: 'https://chatgpt.com/backend-api/codex',
    defaultModels: ['gpt-5.3-codex', 'gpt-5.4', 'gpt-5-codex', 'gpt-5.2'],
    auth: { type: 'oauth', strategy: 'openai-codex' },
    editableBaseUrl: false,
    editableApiKey: false,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    apiType: 'google-generative-ai',
    provider: 'google',
    icon: 'Gemini',
    defaultModels: ['gemini-3-pro-preview', 'gemini-3-flash-preview'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'glm',
    name: 'GLM',
    apiType: 'anthropic-messages',
    provider: 'zai',
    icon: 'ZAI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModels: ['glm-5', 'glm-4.7'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'glm-en',
    name: 'Z.AI',
    apiType: 'anthropic-messages',
    provider: 'zai',
    icon: 'ZAI',
    defaultBaseUrl: 'https://api.z.ai/api/anthropic',
    defaultModels: ['glm-5', 'glm-4.7'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    apiType: 'anthropic-messages',
    provider: 'minimax-cn',
    icon: 'Minimax',
    defaultBaseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModels: ['MiniMax-M2.5', 'MiniMax-M2.1'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'minimax-en',
    name: 'MiniMax (EN)',
    apiType: 'anthropic-messages',
    provider: 'minimax',
    icon: 'Minimax',
    defaultBaseUrl: 'https://api.minimax.io/anthropic',
    defaultModels: ['MiniMax-M2.5', 'MiniMax-M2.1'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
  {
    id: 'kimi',
    name: 'Kimi For Coding',
    apiType: 'anthropic-messages',
    provider: 'kimi-coding',
    icon: 'Kimi',
    defaultBaseUrl: 'https://api.kimi.com/coding',
    defaultModels: ['kimi-for-coding'],
    auth: { type: 'apiKey' },
    editableBaseUrl: true,
    editableApiKey: true,
  },
];
