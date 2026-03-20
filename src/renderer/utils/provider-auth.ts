import type { ConnectionConfig, ConnectionAuthStatus } from '../types';

export function isConnectionConfigured(
  connection: ConnectionConfig,
  authStatus?: ConnectionAuthStatus,
): boolean {
  if (connection.auth.type === 'oauth') {
    return authStatus?.state === 'connected';
  }

  return authStatus?.state === 'connected' || !!connection.apiKey?.trim();
}

export function getConnectionAuthStatus(
  statuses: Record<string, ConnectionAuthStatus>,
  connectionId: string,
): ConnectionAuthStatus | undefined {
  return statuses[connectionId];
}

export const isProviderConfigured = isConnectionConfigured;
export const getProviderAuthStatus = getConnectionAuthStatus;
