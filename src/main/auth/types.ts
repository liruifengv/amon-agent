import type { ProviderConfig } from '@shared/schemas';
import type { AuthSession, ResolvedRequestAuth } from '@shared/provider-auth';

export interface AuthStrategy {
  id: string;
  connect(providerConfig: ProviderConfig): Promise<AuthSession>;
  refresh(session: AuthSession, providerConfig: ProviderConfig): Promise<AuthSession>;
  disconnect?(session: AuthSession, providerConfig: ProviderConfig): Promise<void>;
  resolveRequestAuth(session: AuthSession, providerConfig: ProviderConfig): Promise<ResolvedRequestAuth>;
}
