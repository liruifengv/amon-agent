import type {
  ImageMimeType,
  StopReason,
  TokenUsage,
} from './types';

// ==================== Provider 配置 ====================

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  supportsThinking: boolean;
  supportsImages: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
}

// ==================== Provider Adapter 接口 ====================

export interface ProviderAdapter {
  readonly id: string;
  listModels(): ModelInfo[];
  stream(request: ProviderRequest): AsyncIterable<NormalizedStreamEvent>;
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderToolDef[];
  systemPrompt?: string;
  maxTokens?: number;
  thinkingBudget?: number;
  signal?: AbortSignal;
}

// ==================== Provider 消息（中间表示）====================

export type ProviderMessage =
  | { role: 'user'; content: ProviderUserContent[] }
  | { role: 'assistant'; content: ProviderAssistantContent[] };

export type ProviderUserContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: ImageMimeType }
  | { type: 'tool_result'; toolUseId: string; output: string; isError: boolean };

export type ProviderAssistantContent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

export interface ProviderToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ==================== 归一化流式事件 ====================

export type NormalizedStreamEvent =
  | { type: 'message_start' }
  | { type: 'content_block_start'; index: number; block: ContentBlockStart }
  | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; stopReason: StopReason; usage?: TokenUsage }
  | { type: 'message_stop' }
  | { type: 'error'; error: Error };

export type ContentBlockStart =
  | { type: 'text' }
  | { type: 'thinking' }
  | { type: 'tool_use'; id: string; name: string };

export type ContentBlockDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'signature_delta'; signature: string }
  | { type: 'input_json_delta'; partialJson: string };
