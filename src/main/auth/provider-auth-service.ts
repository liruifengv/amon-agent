import type { ProviderConfig, Settings } from '@shared/schemas';
import type { AuthSession, ProviderAuthStatus, ResolvedRequestAuth } from '@shared/provider-auth';
import type { ConfigStore } from '../store/config-store';
import type { PushService } from '../ipc/push';
import { AuthStore } from './auth-store';
import type { AuthStrategy } from './types';

const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface ProviderAuthServiceDeps {
  configStore: ConfigStore;
  authStore: AuthStore;
  pushService: PushService;
  strategies: AuthStrategy[];
}

export class ProviderAuthService {
  private readonly strategies = new Map<string, AuthStrategy>();
  private readonly refreshInFlight = new Map<string, Promise<AuthSession>>();
  private readonly statusOverrides = new Map<string, ProviderAuthStatus>();

  constructor(private readonly deps: ProviderAuthServiceDeps) {
    for (const strategy of deps.strategies) {
      this.strategies.set(strategy.id, strategy);
    }
  }

  async connect(providerConfigId: string): Promise<ProviderAuthStatus> {
    const providerConfig = await this.getProviderConfig(providerConfigId);
    if (providerConfig.auth.type !== 'oauth') {
      throw new Error(`Provider "${providerConfig.name}" does not use OAuth`);
    }

    this.setStatus({
      providerConfigId,
      state: 'connecting',
    });

    try {
      const strategy = this.getStrategy(providerConfig.auth.strategy);
      const session = await strategy.connect(providerConfig);
      await this.deps.authStore.setSession(session);
      const status = this.sessionToStatus(providerConfigId, session);
      this.setStatus(status);
      return status;
    } catch (error) {
      const status: ProviderAuthStatus = {
        providerConfigId,
        state: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this.setStatus(status);
      throw error;
    }
  }

  async disconnect(providerConfigId: string): Promise<void> {
    const providerConfig = await this.findProviderConfig(providerConfigId);
    const session = await this.deps.authStore.getSession(providerConfigId);

    if (session && providerConfig?.auth.type === 'oauth') {
      const strategy = this.getStrategy(providerConfig.auth.strategy);
      await strategy.disconnect?.(session, providerConfig);
    }

    await this.deps.authStore.deleteSession(providerConfigId);
    this.setStatus({
      providerConfigId,
      state: 'disconnected',
    });
  }

  async getStatuses(): Promise<ProviderAuthStatus[]> {
    const settings = await this.deps.configStore.getSettings();
    const oauthProviders = settings.agent.providerConfigs.filter(
      (config) => config.auth.type === 'oauth',
    );

    return Promise.all(
      oauthProviders.map(async (providerConfig) => this.getStatus(providerConfig.id)),
    );
  }

  async getStatus(providerConfigId: string): Promise<ProviderAuthStatus> {
    const overridden = this.statusOverrides.get(providerConfigId);
    if (overridden) {
      return overridden;
    }

    const session = await this.deps.authStore.getSession(providerConfigId);
    if (!session) {
      return {
        providerConfigId,
        state: 'disconnected',
      };
    }

    return this.sessionToStatus(providerConfigId, session);
  }

  async resolveRequestAuth(providerConfigId: string): Promise<ResolvedRequestAuth | undefined> {
    const providerConfig = await this.getProviderConfig(providerConfigId);
    if (providerConfig.auth.type !== 'oauth') {
      return undefined;
    }

    let session = await this.deps.authStore.getSession(providerConfigId);
    if (!session) {
      throw new Error(`Provider "${providerConfig.name}" is not connected. Open Settings and connect it first.`);
    }

    if (this.shouldRefresh(session)) {
      session = await this.refreshSession(providerConfig, session);
    }

    const strategy = this.getStrategy(providerConfig.auth.strategy);
    return strategy.resolveRequestAuth(session, providerConfig);
  }

  private async refreshSession(providerConfig: ProviderConfig, session: AuthSession): Promise<AuthSession> {
    const existing = this.refreshInFlight.get(providerConfig.id);
    if (existing) {
      return existing;
    }

    const strategy = this.getStrategy(providerConfig.auth.type === 'oauth' ? providerConfig.auth.strategy : '');
    const refreshPromise = strategy.refresh(session, providerConfig)
      .then(async (refreshed) => {
        await this.deps.authStore.setSession(refreshed);
        const status = this.sessionToStatus(providerConfig.id, refreshed);
        this.setStatus(status);
        return refreshed;
      })
      .catch(async (error) => {
        await this.deps.authStore.deleteSession(providerConfig.id);
        const status: ProviderAuthStatus = {
          providerConfigId: providerConfig.id,
          state: 'expired',
          errorMessage: error instanceof Error ? error.message : String(error),
        };
        this.setStatus(status);
        throw error;
      })
      .finally(() => {
        this.refreshInFlight.delete(providerConfig.id);
      });

    this.refreshInFlight.set(providerConfig.id, refreshPromise);
    return refreshPromise;
  }

  private shouldRefresh(session: AuthSession): boolean {
    return typeof session.expiresAt === 'number'
      ? session.expiresAt - REFRESH_SKEW_MS <= Date.now()
      : false;
  }

  private sessionToStatus(providerConfigId: string, session: AuthSession): ProviderAuthStatus {
    return {
      providerConfigId,
      state: 'connected',
      accountLabel: session.accountLabel,
      expiresAt: session.expiresAt,
    };
  }

  private setStatus(status: ProviderAuthStatus): void {
    this.statusOverrides.set(status.providerConfigId, status);
    this.deps.pushService.pushProviderAuthChanged(status.providerConfigId, status);
  }

  private getStrategy(strategyId: string): AuthStrategy {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Unknown auth strategy: ${strategyId}`);
    }
    return strategy;
  }

  private async getProviderConfig(providerConfigId: string): Promise<ProviderConfig> {
    const providerConfig = await this.findProviderConfig(providerConfigId);
    if (!providerConfig) {
      throw new Error(`Provider "${providerConfigId}" not found`);
    }
    return providerConfig;
  }

  private async findProviderConfig(providerConfigId: string): Promise<ProviderConfig | undefined> {
    const settings = await this.deps.configStore.getSettings();
    return settings.agent.providerConfigs.find((config) => config.id === providerConfigId);
  }
}

export function findProviderConfig(settings: Settings, providerConfigId: string): ProviderConfig | undefined {
  return settings.agent.providerConfigs.find((config) => config.id === providerConfigId);
}
