import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/store/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withSession: vi.fn(),
  }),
}));

import { ProviderAuthService } from '@/main/auth/provider-auth-service';
import type { AuthStrategy } from '@/main/auth/types';
import type { ConnectionConfig } from '@/shared/schemas';
import type { AuthSession } from '@/shared/connection-auth';

function createConfigStore(connections: ConnectionConfig[]) {
  return {
    getSettings: vi.fn(async () => ({
      theme: 'system',
      language: 'en',
      chatWidth: 'narrow',
      shortcuts: { newSession: 'CmdOrCtrl+N', openSettings: 'CmdOrCtrl+,' },
      workspaces: [],
      skills: { extraDirs: ['.claude'], disabledSkills: [], initialized: false },
      agent: {
        activeConnectionId: 'codex-1',
        maxTurns: 50,
        thinkingLevel: 'medium',
        defaultApprovalMode: 'ask',
        exaApiKey: '',
        connections,
        compaction: {
          enabled: true,
          reserveTokens: 16384,
          keepRecentTokens: 20000,
          autoCompact: true,
        },
      },
    })),
  };
}

describe('ProviderAuthService', () => {
  let sessions = new Map<string, AuthSession>();
  let strategy: AuthStrategy;
  let service: ProviderAuthService;
  let pushConnectionAuthChanged: ReturnType<typeof vi.fn>;
  let deleteSession: ReturnType<typeof vi.fn>;
  let credentialStore: {
    getApiKey: ReturnType<typeof vi.fn>;
    setApiKey: ReturnType<typeof vi.fn>;
    deleteApiKey: ReturnType<typeof vi.fn>;
  };

  const codexConnection: ConnectionConfig = {
    id: 'codex-1',
    specId: 'codex',
    name: 'Codex',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    modelKey: 'openai-codex:gpt-5.3-codex',
    customModelId: '',
    auth: { type: 'oauth' },
    apiKey: '',
  };

  beforeEach(() => {
    sessions = new Map<string, AuthSession>();
    pushConnectionAuthChanged = vi.fn();
    credentialStore = {
      getApiKey: vi.fn(async () => undefined),
      setApiKey: vi.fn(async () => undefined),
      deleteApiKey: vi.fn(async () => undefined),
    };
    deleteSession = vi.fn(async (id: string) => {
      sessions.delete(id);
    });

    strategy = {
      id: 'openai-codex',
      connect: vi.fn(async () => ({
        connectionId: 'codex-1',
        strategy: 'openai-codex',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() + 60_000,
      })),
      refresh: vi.fn(async (session) => ({
        ...session,
        accessToken: 'access-2',
        expiresAt: Date.now() + 60_000,
      })),
      disconnect: vi.fn(async () => {}),
      resolveRequestAuth: vi.fn(async (session) => ({
        accessToken: session.accessToken,
      })),
    };

    service = new ProviderAuthService({
      configStore: createConfigStore([codexConnection]) as any,
      authStore: {
        getSession: vi.fn(async (id: string) => sessions.get(id)),
        setSession: vi.fn(async (session: AuthSession) => {
          const sessionId = session.connectionId || session.providerConfigId;
          if (!sessionId) {
            throw new Error('missing connection id');
          }
          sessions.set(sessionId, session);
        }),
        deleteSession,
      } as any,
      credentialStore: credentialStore as any,
      pushService: {
        pushConnectionAuthChanged,
      } as any,
      strategies: [strategy],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects and stores a session', async () => {
    const status = await service.connect('codex-1');

    expect(status.state).toBe('connected');
    expect(sessions.get('codex-1')?.accessToken).toBe('access-1');
    expect(strategy.connect).toHaveBeenCalledTimes(1);
  });

  it('refreshes expiring sessions only once for concurrent callers', async () => {
    sessions.set('codex-1', {
      connectionId: 'codex-1',
      strategy: 'openai-codex',
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 1_000,
    });

    const [first, second] = await Promise.all([
      service.resolveRequestAuth('codex-1'),
      service.resolveRequestAuth('codex-1'),
    ]);

    expect(first).toEqual({ accessToken: 'access-2' });
    expect(second).toEqual({ accessToken: 'access-2' });
    expect(strategy.refresh).toHaveBeenCalledTimes(1);
  });

  it('throws when resolving auth without a stored oauth session', async () => {
    await expect(service.resolveRequestAuth('codex-1')).rejects.toThrow(
      'Connection "Codex" is not connected. Open Settings and connect it first.',
    );
  });

  it('marks the connection as expired and clears session when refresh fails', async () => {
    sessions.set('codex-1', {
      connectionId: 'codex-1',
      strategy: 'openai-codex',
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 1_000,
    });

    (strategy.refresh as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('refresh failed'));

    await expect(service.resolveRequestAuth('codex-1')).rejects.toThrow('refresh failed');

    expect(deleteSession).toHaveBeenCalledWith('codex-1');
    expect(sessions.get('codex-1')).toBeUndefined();
    expect(pushConnectionAuthChanged).toHaveBeenCalledWith(
      'codex-1',
      expect.objectContaining({
        connectionId: 'codex-1',
        state: 'expired',
        errorMessage: 'refresh failed',
      }),
    );
  });

  it('disconnect clears local session and triggers strategy disconnect', async () => {
    const existingSession: AuthSession = {
      connectionId: 'codex-1',
      strategy: 'openai-codex',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
    };
    sessions.set('codex-1', existingSession);

    await service.disconnect('codex-1');

    expect(strategy.disconnect).toHaveBeenCalledWith(existingSession, codexConnection);
    expect(deleteSession).toHaveBeenCalledWith('codex-1');
    expect(pushConnectionAuthChanged).toHaveBeenCalledWith(
      'codex-1',
      expect.objectContaining({ state: 'disconnected' }),
    );
  });

  it('sets error status when connect fails', async () => {
    (strategy.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('oauth denied'));

    await expect(service.connect('codex-1')).rejects.toThrow('oauth denied');

    expect(pushConnectionAuthChanged).toHaveBeenNthCalledWith(
      1,
      'codex-1',
      expect.objectContaining({ state: 'connecting' }),
    );
    expect(pushConnectionAuthChanged).toHaveBeenNthCalledWith(
      2,
      'codex-1',
      expect.objectContaining({ state: 'error', errorMessage: 'oauth denied' }),
    );
  });

  it('resolves stored api key credentials before falling back to env', async () => {
    const apiKeyService = new ProviderAuthService({
      configStore: createConfigStore([
        {
          id: 'openai-default',
          specId: 'openai',
          name: 'OpenAI',
          modelKey: 'openai:gpt-5.4',
          customModelId: '',
          auth: { type: 'apiKey', credentialId: 'cred-openai-default' },
          apiKey: '',
        },
      ]) as any,
      authStore: {
        getSession: vi.fn(),
        setSession: vi.fn(),
        deleteSession: vi.fn(),
      } as any,
      credentialStore: {
        getApiKey: vi.fn(async () => 'stored-openai-key'),
        setApiKey: vi.fn(),
        deleteApiKey: vi.fn(),
      } as any,
      pushService: {
        pushConnectionAuthChanged: vi.fn(),
      } as any,
      strategies: [],
    });

    await expect(apiKeyService.resolveRequestAuth('openai-default')).resolves.toEqual({
      accessToken: 'stored-openai-key',
    });
  });
});
