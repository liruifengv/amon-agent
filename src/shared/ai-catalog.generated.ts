export type TransportId =
  | 'anthropic-messages'
  | 'openai-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'google-generative-ai';

export type ServiceId =
  | 'anthropic'
  | 'openai'
  | 'openai-codex'
  | 'google'
  | 'zai'
  | 'minimax'
  | 'minimax-cn'
  | 'kimi-coding';

export interface ServiceDef {
  id: ServiceId;
  name: string;
  icon: string;
  auth:
    | { type: 'apiKey'; envKeys?: string[] }
    | { type: 'oauth'; strategy: 'openai-codex' };
}

export interface ConnectionSpec {
  id: string;
  name: string;
  serviceId: ServiceId;
  transport: TransportId;
  defaultBaseUrl?: string;
  baseUrlMode: 'fixed' | 'editable' | 'required';
  defaultModelKey: string;
  recommendedModelKeys: string[];
  modelFilter?: {
    lifecycle?: Array<'stable' | 'preview'>;
    tags?: string[];
  };
}

export interface CatalogModel {
  key: string;
  serviceId: ServiceId;
  modelId: string;
  name: string;
  lifecycle: 'stable' | 'preview' | 'deprecated';
  limits: {
    contextWindow: number;
    maxOutputTokens: number;
  };
  capabilities: {
    reasoning: boolean;
    thinkingLevels?: Array<'low' | 'medium' | 'high' | 'xhigh'>;
    input: Array<'text' | 'image'>;
    tools: boolean;
    structuredOutput?: boolean;
  };
  pricing?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  availability: Partial<Record<TransportId, {
    enabled: true;
    compat?: Record<string, unknown>;
    modelIdOverride?: string;
    maxOutputTokensOverride?: number;
  }>>;
  tags: string[];
}

export interface AiCatalog {
  version: string;
  services: Record<ServiceId, ServiceDef>;
  connectionSpecs: Record<string, ConnectionSpec>;
  models: Record<string, CatalogModel>;
}

export const AI_CATALOG: AiCatalog = {
  version: '2026-03-20',
  services: {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      icon: 'Anthropic',
      auth: { type: 'apiKey', envKeys: ['ANTHROPIC_API_KEY'] },
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      icon: 'OpenAI',
      auth: { type: 'apiKey', envKeys: ['OPENAI_API_KEY'] },
    },
    'openai-codex': {
      id: 'openai-codex',
      name: 'Codex',
      icon: 'OpenAI',
      auth: { type: 'oauth', strategy: 'openai-codex' },
    },
    google: {
      id: 'google',
      name: 'Google',
      icon: 'Gemini',
      auth: { type: 'apiKey' },
    },
    zai: {
      id: 'zai',
      name: 'Z.AI',
      icon: 'ZAI',
      auth: { type: 'apiKey' },
    },
    minimax: {
      id: 'minimax',
      name: 'MiniMax',
      icon: 'Minimax',
      auth: { type: 'apiKey' },
    },
    'minimax-cn': {
      id: 'minimax-cn',
      name: 'MiniMax CN',
      icon: 'Minimax',
      auth: { type: 'apiKey' },
    },
    'kimi-coding': {
      id: 'kimi-coding',
      name: 'Kimi For Coding',
      icon: 'Kimi',
      auth: { type: 'apiKey' },
    },
  },
  connectionSpecs: {
    claude: {
      id: 'claude',
      name: 'Anthropic Claude',
      serviceId: 'anthropic',
      transport: 'anthropic-messages',
      defaultBaseUrl: 'https://api.anthropic.com',
      baseUrlMode: 'editable',
      defaultModelKey: 'anthropic:claude-opus-4-6',
      recommendedModelKeys: [
        'anthropic:claude-opus-4-6',
        'anthropic:claude-opus-4-5-20251101',
        'anthropic:claude-sonnet-4-5-20250929',
        'anthropic:claude-haiku-4-5-20251001',
      ],
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      serviceId: 'openai',
      transport: 'openai-completions',
      defaultBaseUrl: 'https://api.openai.com/v1',
      baseUrlMode: 'editable',
      defaultModelKey: 'openai:gpt-5.4',
      recommendedModelKeys: [
        'openai:gpt-5.2',
        'openai:gpt-5.3-codex',
        'openai:gpt-5.4',
      ],
    },
    'openai-responses': {
      id: 'openai-responses',
      name: 'OpenAI Responses',
      serviceId: 'openai',
      transport: 'openai-responses',
      defaultBaseUrl: 'https://api.openai.com/v1',
      baseUrlMode: 'editable',
      defaultModelKey: 'openai:gpt-5.4',
      recommendedModelKeys: [
        'openai:gpt-5.2',
        'openai:gpt-5.3-codex',
        'openai:gpt-5.4',
      ],
    },
    codex: {
      id: 'codex',
      name: 'Codex',
      serviceId: 'openai-codex',
      transport: 'openai-codex-responses',
      defaultBaseUrl: 'https://chatgpt.com/backend-api/codex',
      baseUrlMode: 'fixed',
      defaultModelKey: 'openai-codex:gpt-5.3-codex',
      recommendedModelKeys: [
        'openai-codex:gpt-5.3-codex',
        'openai-codex:gpt-5.4',
        'openai-codex:gpt-5.2-codex',
      ],
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      serviceId: 'google',
      transport: 'google-generative-ai',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      baseUrlMode: 'editable',
      defaultModelKey: 'google:gemini-3-pro-preview',
      recommendedModelKeys: [
        'google:gemini-3-pro-preview',
        'google:gemini-3-flash-preview',
      ],
    },
    glm: {
      id: 'glm',
      name: 'GLM',
      serviceId: 'zai',
      transport: 'anthropic-messages',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
      baseUrlMode: 'editable',
      defaultModelKey: 'zai:glm-5',
      recommendedModelKeys: ['zai:glm-5', 'zai:glm-4.7'],
    },
    'glm-en': {
      id: 'glm-en',
      name: 'Z.AI',
      serviceId: 'zai',
      transport: 'anthropic-messages',
      defaultBaseUrl: 'https://api.z.ai/api/anthropic',
      baseUrlMode: 'editable',
      defaultModelKey: 'zai:glm-5',
      recommendedModelKeys: ['zai:glm-5', 'zai:glm-4.7'],
    },
    minimax: {
      id: 'minimax',
      name: 'MiniMax',
      serviceId: 'minimax-cn',
      transport: 'anthropic-messages',
      defaultBaseUrl: 'https://api.minimaxi.com/anthropic',
      baseUrlMode: 'editable',
      defaultModelKey: 'minimax-cn:MiniMax-M2.5',
      recommendedModelKeys: ['minimax-cn:MiniMax-M2.5', 'minimax-cn:MiniMax-M2.1'],
    },
    'minimax-en': {
      id: 'minimax-en',
      name: 'MiniMax (EN)',
      serviceId: 'minimax',
      transport: 'anthropic-messages',
      defaultBaseUrl: 'https://api.minimax.io/anthropic',
      baseUrlMode: 'editable',
      defaultModelKey: 'minimax:MiniMax-M2.5',
      recommendedModelKeys: ['minimax:MiniMax-M2.5', 'minimax:MiniMax-M2.1'],
    },
    kimi: {
      id: 'kimi',
      name: 'Kimi For Coding',
      serviceId: 'kimi-coding',
      transport: 'anthropic-messages',
      defaultBaseUrl: 'https://api.kimi.com/coding',
      baseUrlMode: 'editable',
      defaultModelKey: 'kimi-coding:kimi-for-coding',
      recommendedModelKeys: ['kimi-coding:kimi-for-coding'],
    },
  },
  models: {
    'anthropic:claude-haiku-4-5': {
      key: 'anthropic:claude-haiku-4-5',
      serviceId: 'anthropic',
      modelId: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5 (latest)',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['latest', 'fast'],
    },
    'anthropic:claude-haiku-4-5-20251001': {
      key: 'anthropic:claude-haiku-4-5-20251001',
      serviceId: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['fast'],
    },
    'anthropic:claude-sonnet-4-5': {
      key: 'anthropic:claude-sonnet-4-5',
      serviceId: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5 (latest)',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['latest', 'balanced'],
    },
    'anthropic:claude-sonnet-4-5-20250929': {
      key: 'anthropic:claude-sonnet-4-5-20250929',
      serviceId: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['balanced'],
    },
    'anthropic:claude-sonnet-4-6': {
      key: 'anthropic:claude-sonnet-4-6',
      serviceId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['balanced'],
    },
    'anthropic:claude-opus-4-5': {
      key: 'anthropic:claude-opus-4-5',
      serviceId: 'anthropic',
      modelId: 'claude-opus-4-5',
      name: 'Claude Opus 4.5 (latest)',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['latest', 'flagship'],
    },
    'anthropic:claude-opus-4-5-20251101': {
      key: 'anthropic:claude-opus-4-5-20251101',
      serviceId: 'anthropic',
      modelId: 'claude-opus-4-5-20251101',
      name: 'Claude Opus 4.5',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['flagship'],
    },
    'anthropic:claude-opus-4-6': {
      key: 'anthropic:claude-opus-4-6',
      serviceId: 'anthropic',
      modelId: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['flagship'],
    },
    'openai:gpt-5': {
      key: 'openai:gpt-5',
      serviceId: 'openai',
      modelId: 'gpt-5',
      name: 'GPT-5',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
      availability: { 'openai-responses': { enabled: true }, 'openai-completions': { enabled: true } },
      tags: ['flagship'],
    },
    'openai:gpt-5-mini': {
      key: 'openai:gpt-5-mini',
      serviceId: 'openai',
      modelId: 'gpt-5-mini',
      name: 'GPT-5 Mini',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
      availability: { 'openai-responses': { enabled: true }, 'openai-completions': { enabled: true } },
      tags: ['fast'],
    },
    'openai:gpt-5.2': {
      key: 'openai:gpt-5.2',
      serviceId: 'openai',
      modelId: 'gpt-5.2',
      name: 'GPT-5.2',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
      availability: { 'openai-responses': { enabled: true }, 'openai-completions': { enabled: true } },
      tags: ['flagship'],
    },
    'openai:gpt-5.2-codex': {
      key: 'openai:gpt-5.2-codex',
      serviceId: 'openai',
      modelId: 'gpt-5.2',
      name: 'GPT-5.2 Codex',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
      availability: { 'openai-responses': { enabled: true }, 'openai-completions': { enabled: true } },
      tags: ['coding'],
    },
    'openai:gpt-5.3-codex': {
      key: 'openai:gpt-5.3-codex',
      serviceId: 'openai',
      modelId: 'gpt-5.3-codex',
      name: 'GPT-5.3 Codex',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
      availability: { 'openai-responses': { enabled: true }, 'openai-completions': { enabled: true } },
      tags: ['coding'],
    },
    'openai:gpt-5.4': {
      key: 'openai:gpt-5.4',
      serviceId: 'openai',
      modelId: 'gpt-5.4',
      name: 'GPT-5.4',
      lifecycle: 'stable',
      limits: { contextWindow: 1050000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
      availability: { 'openai-responses': { enabled: true }, 'openai-completions': { enabled: true } },
      tags: ['flagship'],
    },
    'openai-codex:gpt-5.2-codex': {
      key: 'openai-codex:gpt-5.2-codex',
      serviceId: 'openai-codex',
      modelId: 'gpt-5.2-codex',
      name: 'GPT-5.2-Codex',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
      availability: { 'openai-codex-responses': { enabled: true } },
      tags: ['coding'],
    },
    'openai-codex:gpt-5.1-codex-max': {
      key: 'openai-codex:gpt-5.1-codex-max',
      serviceId: 'openai-codex',
      modelId: 'gpt-5.1-codex-max',
      name: 'GPT-5.1-Codex-Max',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
      availability: { 'openai-codex-responses': { enabled: true } },
      tags: ['coding'],
    },
    'openai-codex:gpt-5.1-codex': {
      key: 'openai-codex:gpt-5.1-codex',
      serviceId: 'openai-codex',
      modelId: 'gpt-5.1-codex',
      name: 'GPT-5.1-Codex',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
      availability: { 'openai-codex-responses': { enabled: true } },
      tags: ['coding'],
    },
    'openai-codex:gpt-5.1-codex-mini': {
      key: 'openai-codex:gpt-5.1-codex-mini',
      serviceId: 'openai-codex',
      modelId: 'gpt-5.1-codex-mini',
      name: 'GPT-5.1 Codex mini',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
      availability: { 'openai-codex-responses': { enabled: true } },
      tags: ['coding', 'fast'],
    },
    'openai-codex:gpt-5.3-codex': {
      key: 'openai-codex:gpt-5.3-codex',
      serviceId: 'openai-codex',
      modelId: 'gpt-5.3-codex',
      name: 'GPT-5.3 Codex',
      lifecycle: 'stable',
      limits: { contextWindow: 400000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
      availability: { 'openai-codex-responses': { enabled: true } },
      tags: ['coding'],
    },
    'openai-codex:gpt-5.4': {
      key: 'openai-codex:gpt-5.4',
      serviceId: 'openai-codex',
      modelId: 'gpt-5.4',
      name: 'GPT-5.4',
      lifecycle: 'stable',
      limits: { contextWindow: 1050000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh'], input: ['text', 'image'], tools: true },
      pricing: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
      availability: { 'openai-codex-responses': { enabled: true } },
      tags: ['coding', 'flagship'],
    },
    'google:gemini-2.0-flash': {
      key: 'google:gemini-2.0-flash',
      serviceId: 'google',
      modelId: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      lifecycle: 'stable',
      limits: { contextWindow: 1048576, maxOutputTokens: 8192 },
      capabilities: { reasoning: false, input: ['text', 'image'], tools: true },
      pricing: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
      availability: { 'google-generative-ai': { enabled: true } },
      tags: ['fast'],
    },
    'google:gemini-2.5-flash': {
      key: 'google:gemini-2.5-flash',
      serviceId: 'google',
      modelId: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      lifecycle: 'stable',
      limits: { contextWindow: 1048576, maxOutputTokens: 65536 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0 },
      availability: { 'google-generative-ai': { enabled: true } },
      tags: ['fast'],
    },
    'google:gemini-2.5-pro': {
      key: 'google:gemini-2.5-pro',
      serviceId: 'google',
      modelId: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      lifecycle: 'stable',
      limits: { contextWindow: 1048576, maxOutputTokens: 65536 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 0 },
      availability: { 'google-generative-ai': { enabled: true } },
      tags: ['flagship'],
    },
    'google:gemini-3-flash-preview': {
      key: 'google:gemini-3-flash-preview',
      serviceId: 'google',
      modelId: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash Preview',
      lifecycle: 'preview',
      limits: { contextWindow: 1048576, maxOutputTokens: 65536 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0 },
      availability: { 'google-generative-ai': { enabled: true } },
      tags: ['preview', 'fast'],
    },
    'google:gemini-3-pro-preview': {
      key: 'google:gemini-3-pro-preview',
      serviceId: 'google',
      modelId: 'gemini-3-pro-preview',
      name: 'Gemini 3 Pro Preview',
      lifecycle: 'preview',
      limits: { contextWindow: 1000000, maxOutputTokens: 64000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text', 'image'], tools: true },
      pricing: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
      availability: { 'google-generative-ai': { enabled: true } },
      tags: ['preview', 'flagship'],
    },
    'zai:glm-5': {
      key: 'zai:glm-5',
      serviceId: 'zai',
      modelId: 'glm-5',
      name: 'GLM-5',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 1, output: 3.2, cacheRead: 0.1, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['flagship'],
    },
    'zai:glm-4.7': {
      key: 'zai:glm-4.7',
      serviceId: 'zai',
      modelId: 'glm-4.7',
      name: 'GLM-4.7',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 0.55, output: 2.2, cacheRead: 0.06, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['balanced'],
    },
    'minimax:MiniMax-M2.5': {
      key: 'minimax:MiniMax-M2.5',
      serviceId: 'minimax',
      modelId: 'MiniMax-M2.5',
      name: 'MiniMax M2.5',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['flagship'],
    },
    'minimax:MiniMax-M2.1': {
      key: 'minimax:MiniMax-M2.1',
      serviceId: 'minimax',
      modelId: 'MiniMax-M2.1',
      name: 'MiniMax M2.1',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['balanced'],
    },
    'minimax-cn:MiniMax-M2.5': {
      key: 'minimax-cn:MiniMax-M2.5',
      serviceId: 'minimax-cn',
      modelId: 'MiniMax-M2.5',
      name: 'MiniMax M2.5',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 0.29, output: 1.15, cacheRead: 0.03, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['flagship'],
    },
    'minimax-cn:MiniMax-M2.1': {
      key: 'minimax-cn:MiniMax-M2.1',
      serviceId: 'minimax-cn',
      modelId: 'MiniMax-M2.1',
      name: 'MiniMax M2.1',
      lifecycle: 'stable',
      limits: { contextWindow: 200000, maxOutputTokens: 128000 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 0.29, output: 1.15, cacheRead: 0.03, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['balanced'],
    },
    'kimi-coding:kimi-for-coding': {
      key: 'kimi-coding:kimi-for-coding',
      serviceId: 'kimi-coding',
      modelId: 'kimi-for-coding',
      name: 'Kimi For Coding',
      lifecycle: 'stable',
      limits: { contextWindow: 262144, maxOutputTokens: 8192 },
      capabilities: { reasoning: true, thinkingLevels: ['low', 'medium', 'high'], input: ['text'], tools: true },
      pricing: { input: 0.6, output: 2.5, cacheRead: 0.06, cacheWrite: 0 },
      availability: { 'anthropic-messages': { enabled: true } },
      tags: ['coding'],
    },
  },
};
