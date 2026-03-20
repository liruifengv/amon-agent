import type { ConnectionConfig } from '@shared/schemas';
import type { AuthSession, ResolvedRequestAuth } from '@shared/connection-auth';

export interface AuthStrategy {
  id: string;
  connect(connection: ConnectionConfig): Promise<AuthSession>;
  refresh(session: AuthSession, connection: ConnectionConfig): Promise<AuthSession>;
  disconnect?(session: AuthSession, connection: ConnectionConfig): Promise<void>;
  resolveRequestAuth(session: AuthSession, connection: ConnectionConfig): Promise<ResolvedRequestAuth>;
}
