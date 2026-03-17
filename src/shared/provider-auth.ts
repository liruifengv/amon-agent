export type ProviderAuthState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'expired'
  | 'error';

export interface ApiKeyAuthConfig {
  type: 'apiKey';
}

export interface OAuthAuthConfig {
  type: 'oauth';
  strategy: 'openai-codex';
}

export type ProviderAuthConfig = ApiKeyAuthConfig | OAuthAuthConfig;

export interface ProviderAuthStatus {
  providerConfigId: string;
  state: ProviderAuthState;
  accountLabel?: string;
  expiresAt?: number;
  errorMessage?: string;
}

export interface ResolvedRequestAuth {
  accessToken?: string;
  headers?: Record<string, string>;
  baseUrl?: string;
}

export interface AuthSession {
  providerConfigId: string;
  strategy: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountLabel?: string;
  metadata?: Record<string, unknown>;
}
