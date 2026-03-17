import type { ProviderConfig, ProviderAuthStatus } from '../types';

export function isProviderConfigured(
  providerConfig: ProviderConfig,
  authStatus?: ProviderAuthStatus,
): boolean {
  if (providerConfig.auth.type === 'oauth') {
    return authStatus?.state === 'connected';
  }

  return !!providerConfig.apiKey?.trim();
}

export function getProviderAuthStatus(
  statuses: Record<string, ProviderAuthStatus>,
  providerConfigId: string,
): ProviderAuthStatus | undefined {
  return statuses[providerConfigId];
}
