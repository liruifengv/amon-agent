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
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    icon: 'Anthropic',
    defaultModels: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-5-20241022'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    icon: 'OpenAI',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    icon: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    type: 'openai',
    icon: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModels: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    type: 'openai',
    icon: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModels: ['mistral-large-latest', 'mistral-small-latest'],
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'openai',
    icon: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModels: ['llama-3.3-70b-versatile'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    icon: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModels: ['anthropic/claude-sonnet-4'],
  },
  {
    id: 'xai',
    name: 'xAI',
    type: 'openai',
    icon: 'Grok',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModels: ['grok-3', 'grok-3-mini'],
  },
  {
    id: 'together',
    name: 'Together AI',
    type: 'openai',
    icon: 'Together',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  },
  {
    id: 'siliconcloud',
    name: 'SiliconCloud',
    type: 'openai',
    icon: 'SiliconCloud',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModels: ['Qwen/Qwen2.5-72B-Instruct'],
  },
];
