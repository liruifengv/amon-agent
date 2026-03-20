export type ConnectionAuthState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'expired'
  | 'error';

export interface ApiKeyAuthConfig {
  type: 'apiKey';
  credentialId?: string | null;
}

export interface OAuthAuthConfig {
  type: 'oauth';
  strategy?: 'openai-codex';
}

export type ConnectionAuthConfig = ApiKeyAuthConfig | OAuthAuthConfig;

export interface ConnectionAuthStatus {
  connectionId: string;
  state: ConnectionAuthState;
  source?: 'apiKey' | 'env' | 'oauth';
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
  connectionId?: string;
  providerConfigId?: string;
  strategy: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountLabel?: string;
  metadata?: Record<string, unknown>;
}
