import { AI_CATALOG } from '@shared/ai-catalog.generated';
import { getConnectionSpec } from '@shared/ai-catalog';
import type { ConnectionConfig, Settings } from '@shared/schemas';
import type { AuthSession, ConnectionAuthStatus, ResolvedRequestAuth } from '@shared/connection-auth';
import type { ConfigStore } from '../store/config-store';
import type { PushService } from '../ipc/push';
import { AuthStore } from './auth-store';
import { CredentialStore } from './credential-store';
import type { AuthStrategy } from './types';

const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface ConnectionAuthServiceDeps {
  configStore: ConfigStore;
  authStore: AuthStore;
  credentialStore: CredentialStore;
  pushService: PushService;
  strategies: AuthStrategy[];
}

export class ConnectionAuthService {
  private readonly strategies = new Map<string, AuthStrategy>();
  private readonly refreshInFlight = new Map<string, Promise<AuthSession>>();
  private readonly statusOverrides = new Map<string, ConnectionAuthStatus>();

  constructor(private readonly deps: ConnectionAuthServiceDeps) {
    for (const strategy of deps.strategies) {
      this.strategies.set(strategy.id, strategy);
    }
  }

  async connect(connectionId: string): Promise<ConnectionAuthStatus> {
    const connection = await this.getConnection(connectionId);
    const serviceAuth = this.getServiceAuth(connection);
    if (serviceAuth.type !== 'oauth') {
      throw new Error(`Connection "${connection.name}" does not use OAuth`);
    }

    this.setStatus({
      connectionId,
      state: 'connecting',
      source: 'oauth',
    });

    try {
      const strategy = this.getStrategy(serviceAuth.strategy);
      const session = await strategy.connect(connection);
      await this.deps.authStore.setSession(session);
      const status = this.sessionToStatus(connectionId, session);
      this.setStatus(status);
      return status;
    } catch (error) {
      const status: ConnectionAuthStatus = {
        connectionId,
        state: 'error',
        source: 'oauth',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this.setStatus(status);
      throw error;
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = await this.findConnection(connectionId);
    const session = await this.deps.authStore.getSession(connectionId);

    if (session && connection) {
      const serviceAuth = this.getServiceAuth(connection);
      if (serviceAuth.type === 'oauth') {
        const strategy = this.getStrategy(serviceAuth.strategy);
        await strategy.disconnect?.(session, connection);
      }
    }

    await this.deps.authStore.deleteSession(connectionId);

    const connectionStatus = connection
      ? await this.computeConnectionStatus(connection)
      : { connectionId, state: 'disconnected' as const };
    this.setStatus(connectionStatus);
  }

  async getStatuses(): Promise<ConnectionAuthStatus[]> {
    const settings = await this.deps.configStore.getSettings();
    return Promise.all(settings.agent.connections.map(async (connection) => this.getStatus(connection.id)));
  }

  async getStatus(connectionId: string): Promise<ConnectionAuthStatus> {
    const overridden = this.statusOverrides.get(connectionId);
    if (overridden) {
      return overridden;
    }

    const connection = await this.findConnection(connectionId);
    if (!connection) {
      return {
        connectionId,
        state: 'disconnected',
      };
    }

    return this.computeConnectionStatus(connection);
  }

  async resolveRequestAuth(connectionId: string): Promise<ResolvedRequestAuth | undefined> {
    const connection = await this.getConnection(connectionId);
    const serviceAuth = this.getServiceAuth(connection);

    if (serviceAuth.type === 'apiKey') {
      const accessToken = await this.resolveApiKey(connection);
      return accessToken ? { accessToken } : undefined;
    }

    let session = await this.deps.authStore.getSession(connectionId);
    if (!session) {
      throw new Error(`Connection "${connection.name}" is not connected. Open Settings and connect it first.`);
    }

    if (this.shouldRefresh(session)) {
      session = await this.refreshSession(connection, session);
    }

    const strategy = this.getStrategy(serviceAuth.strategy);
    return strategy.resolveRequestAuth(session, connection);
  }

  private async computeConnectionStatus(connection: ConnectionConfig): Promise<ConnectionAuthStatus> {
    const serviceAuth = this.getServiceAuth(connection);

    if (serviceAuth.type === 'apiKey') {
      const storedApiKey = connection.auth.type === 'apiKey' && connection.auth.credentialId
        ? await this.deps.credentialStore.getApiKey(connection.auth.credentialId)
        : undefined;
      if (storedApiKey?.trim() || connection.apiKey?.trim()) {
        return { connectionId: connection.id, state: 'connected', source: 'apiKey' };
      }

      const envKey = this.resolveEnvApiKey(connection);
      if (envKey) {
        return { connectionId: connection.id, state: 'connected', source: 'env' };
      }

      return { connectionId: connection.id, state: 'disconnected', source: 'apiKey' };
    }

    const session = await this.deps.authStore.getSession(connection.id);
    if (!session) {
      return {
        connectionId: connection.id,
        state: 'disconnected',
        source: 'oauth',
      };
    }

    return this.sessionToStatus(connection.id, session);
  }

  private async resolveApiKey(connection: ConnectionConfig): Promise<string | undefined> {
    if (connection.auth.type === 'apiKey' && connection.auth.credentialId) {
      const stored = await this.deps.credentialStore.getApiKey(connection.auth.credentialId);
      if (stored?.trim()) {
        return stored.trim();
      }
    }

    return connection.apiKey?.trim() || this.resolveEnvApiKey(connection);
  }

  private resolveEnvApiKey(connection: ConnectionConfig): string | undefined {
    const serviceAuth = this.getServiceAuth(connection);
    if (serviceAuth.type !== 'apiKey' || !serviceAuth.envKeys?.length) {
      return undefined;
    }

    for (const envKey of serviceAuth.envKeys) {
      const value = process.env[envKey];
      if (value?.trim()) {
        return value;
      }
    }

    return undefined;
  }

  private getServiceAuth(connection: ConnectionConfig) {
    const spec = getConnectionSpec(connection.specId);
    return AI_CATALOG.services[spec.serviceId].auth;
  }

  private async refreshSession(connection: ConnectionConfig, session: AuthSession): Promise<AuthSession> {
    const existing = this.refreshInFlight.get(connection.id);
    if (existing) {
      return existing;
    }

    const serviceAuth = this.getServiceAuth(connection);
    if (serviceAuth.type !== 'oauth') {
      throw new Error(`Connection "${connection.name}" does not use OAuth`);
    }

    const strategy = this.getStrategy(serviceAuth.strategy);
    const refreshPromise = strategy.refresh(session, connection)
      .then(async (refreshed) => {
        await this.deps.authStore.setSession(refreshed);
        const status = this.sessionToStatus(connection.id, refreshed);
        this.setStatus(status);
        return refreshed;
      })
      .catch(async (error) => {
        await this.deps.authStore.deleteSession(connection.id);
        const status: ConnectionAuthStatus = {
          connectionId: connection.id,
          state: 'expired',
          source: 'oauth',
          errorMessage: error instanceof Error ? error.message : String(error),
        };
        this.setStatus(status);
        throw error;
      })
      .finally(() => {
        this.refreshInFlight.delete(connection.id);
      });

    this.refreshInFlight.set(connection.id, refreshPromise);
    return refreshPromise;
  }

  private shouldRefresh(session: AuthSession): boolean {
    return typeof session.expiresAt === 'number'
      ? session.expiresAt - REFRESH_SKEW_MS <= Date.now()
      : false;
  }

  private sessionToStatus(connectionId: string, session: AuthSession): ConnectionAuthStatus {
    return {
      connectionId,
      state: 'connected',
      source: 'oauth',
      accountLabel: session.accountLabel,
      expiresAt: session.expiresAt,
    };
  }

  private setStatus(status: ConnectionAuthStatus): void {
    this.statusOverrides.set(status.connectionId, status);
    this.deps.pushService.pushConnectionAuthChanged(status.connectionId, status);
  }

  private getStrategy(strategyId: string): AuthStrategy {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Unknown auth strategy: ${strategyId}`);
    }
    return strategy;
  }

  private async getConnection(connectionId: string): Promise<ConnectionConfig> {
    const connection = await this.findConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection "${connectionId}" not found`);
    }
    return connection;
  }

  private async findConnection(connectionId: string): Promise<ConnectionConfig | undefined> {
    const settings = await this.deps.configStore.getSettings();
    return settings.agent.connections.find((connection) => connection.id === connectionId);
  }
}

export function findConnection(settings: Settings, connectionId: string): ConnectionConfig | undefined {
  return settings.agent.connections.find((connection) => connection.id === connectionId);
}
