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
import type { ProviderConfig } from '@/shared/schemas';
import type { AuthSession } from '@/shared/provider-auth';

function createConfigStore(providerConfigs: ProviderConfig[]) {
  return {
    getSettings: vi.fn(async () => ({
      theme: 'system',
      language: 'en',
      chatWidth: 'narrow',
      shortcuts: { newSession: 'CmdOrCtrl+N', openSettings: 'CmdOrCtrl+,' },
      workspaces: [],
      skills: { extraDirs: ['.claude'], disabledSkills: [], initialized: false },
      agent: {
        activeProviderId: 'codex-1',
        activeModelId: 'gpt-5.3-codex',
        maxTurns: 50,
        thinkingLevel: 'medium',
        defaultApprovalMode: 'ask',
        exaApiKey: '',
        providerConfigs,
      },
    })),
  };
}

describe('ProviderAuthService', () => {
  let sessions = new Map<string, AuthSession>();
  let strategy: AuthStrategy;
  let service: ProviderAuthService;
  let pushProviderAuthChanged: ReturnType<typeof vi.fn>;
  let deleteSession: ReturnType<typeof vi.fn>;

  const codexProvider: ProviderConfig = {
    id: 'codex-1',
    name: 'Codex',
    apiType: 'openai-codex-responses',
    provider: 'openai-codex',
    icon: 'OpenAI',
    apiKey: '',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    modelId: 'gpt-5.3-codex',
    auth: { type: 'oauth', strategy: 'openai-codex' },
  };

  beforeEach(() => {
    sessions = new Map<string, AuthSession>();
    pushProviderAuthChanged = vi.fn();
    deleteSession = vi.fn(async (id: string) => {
      sessions.delete(id);
    });

    strategy = {
      id: 'openai-codex',
      connect: vi.fn(async () => ({
        providerConfigId: 'codex-1',
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
      configStore: createConfigStore([codexProvider]) as any,
      authStore: {
        getSession: vi.fn(async (id: string) => sessions.get(id)),
        setSession: vi.fn(async (session: AuthSession) => {
          sessions.set(session.providerConfigId, session);
        }),
        deleteSession,
      } as any,
      pushService: {
        pushProviderAuthChanged,
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
      providerConfigId: 'codex-1',
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
      'Provider "Codex" is not connected. Open Settings and connect it first.',
    );
  });

  it('marks provider as expired and clears session when refresh fails', async () => {
    sessions.set('codex-1', {
      providerConfigId: 'codex-1',
      strategy: 'openai-codex',
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 1_000,
    });

    (strategy.refresh as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('refresh failed'));

    await expect(service.resolveRequestAuth('codex-1')).rejects.toThrow('refresh failed');

    expect(deleteSession).toHaveBeenCalledWith('codex-1');
    expect(sessions.get('codex-1')).toBeUndefined();
    expect(pushProviderAuthChanged).toHaveBeenCalledWith(
      'codex-1',
      expect.objectContaining({
        providerConfigId: 'codex-1',
        state: 'expired',
        errorMessage: 'refresh failed',
      }),
    );
  });

  it('disconnect clears local session and triggers strategy disconnect', async () => {
    const existingSession: AuthSession = {
      providerConfigId: 'codex-1',
      strategy: 'openai-codex',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
    };
    sessions.set('codex-1', existingSession);

    await service.disconnect('codex-1');

    expect(strategy.disconnect).toHaveBeenCalledWith(existingSession, codexProvider);
    expect(deleteSession).toHaveBeenCalledWith('codex-1');
    expect(pushProviderAuthChanged).toHaveBeenCalledWith(
      'codex-1',
      expect.objectContaining({ state: 'disconnected' }),
    );
  });

  it('sets error status when connect fails', async () => {
    (strategy.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('oauth denied'));

    await expect(service.connect('codex-1')).rejects.toThrow('oauth denied');

    expect(pushProviderAuthChanged).toHaveBeenNthCalledWith(
      1,
      'codex-1',
      expect.objectContaining({ state: 'connecting' }),
    );
    expect(pushProviderAuthChanged).toHaveBeenNthCalledWith(
      2,
      'codex-1',
      expect.objectContaining({ state: 'error', errorMessage: 'oauth denied' }),
    );
  });
});
