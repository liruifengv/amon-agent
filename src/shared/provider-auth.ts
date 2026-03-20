import type {
  AuthSession as ConnectionAuthSession,
  ConnectionAuthConfig,
  ConnectionAuthState,
  ConnectionAuthStatus,
  ResolvedRequestAuth,
} from './connection-auth';

export type ProviderAuthConfig = ConnectionAuthConfig;
export type ProviderAuthState = ConnectionAuthState;

export interface ProviderAuthStatus extends Omit<ConnectionAuthStatus, 'connectionId'> {
  providerConfigId: string;
}

export interface AuthSession extends Omit<ConnectionAuthSession, 'connectionId'> {
  connectionId?: string;
  providerConfigId: string;
}

export type { ResolvedRequestAuth };
