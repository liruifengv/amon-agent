import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  parseSettings,
} from '@shared/schemas';

describe('DEFAULT_SETTINGS', () => {
  it('uses the expected top-level defaults', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(DEFAULT_SETTINGS.language).toBe('en');
    expect(DEFAULT_SETTINGS.chatWidth).toBe('narrow');
    expect(DEFAULT_SETTINGS.workspaces).toEqual([]);
    expect(DEFAULT_SETTINGS.shortcuts).toEqual(DEFAULT_SHORTCUTS);
    expect(DEFAULT_SETTINGS.agent).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});

describe('DEFAULT_AGENT_SETTINGS', () => {
  it('starts with no active connection and no compatibility fields', () => {
    expect(DEFAULT_AGENT_SETTINGS.activeConnectionId).toBeNull();
    expect(DEFAULT_AGENT_SETTINGS.connections).toEqual([]);
    expect(DEFAULT_AGENT_SETTINGS).not.toHaveProperty('activeProviderId');
    expect(DEFAULT_AGENT_SETTINGS).not.toHaveProperty('activeModelId');
    expect(DEFAULT_AGENT_SETTINGS).not.toHaveProperty('providerConfigs');
  });

  it('uses the expected agent defaults', () => {
    expect(DEFAULT_AGENT_SETTINGS.maxTurns).toBe(50);
    expect(DEFAULT_AGENT_SETTINGS.thinkingLevel).toBe('medium');
    expect(DEFAULT_AGENT_SETTINGS.compaction).toEqual({
      reserveTokens: 16384,
      keepRecentTokens: 20000,
      autoCompact: true,
    });
  });
});

describe('parseSettings', () => {
  it('returns defaults for empty or invalid root values', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('string')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(123)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(true)).toEqual(DEFAULT_SETTINGS);
  });

  it('preserves valid top-level fields', () => {
    const result = parseSettings({
      theme: 'dark',
      language: 'zh',
      chatWidth: 'wide',
    });

    expect(result.theme).toBe('dark');
    expect(result.language).toBe('zh');
    expect(result.chatWidth).toBe('wide');
  });

  it('preserves valid connection-based agent settings', () => {
    const result = parseSettings({
      agent: {
        activeConnectionId: 'openai-default',
        maxTurns: 100,
        thinkingLevel: 'high',
        compaction: {
          reserveTokens: 8192,
          keepRecentTokens: 12000,
          autoCompact: false,
        },
        connections: [
          {
            id: 'openai-default',
            specId: 'openai',
            name: 'OpenAI',
            apiKey: 'sk-test',
            modelKey: 'openai:gpt-5.4',
            auth: { type: 'apiKey' },
          },
        ],
      },
    });

    expect(result.agent.activeConnectionId).toBe('openai-default');
    expect(result.agent.maxTurns).toBe(100);
    expect(result.agent.thinkingLevel).toBe('high');
    expect(result.agent.compaction).toEqual({
      reserveTokens: 8192,
      keepRecentTokens: 12000,
      autoCompact: false,
    });
    expect(result.agent.connections).toEqual([
      expect.objectContaining({
        id: 'openai-default',
        specId: 'openai',
        name: 'OpenAI',
        apiKey: 'sk-test',
        modelKey: 'openai:gpt-5.4',
        auth: { type: 'apiKey' },
      }),
    ]);
    expect(result.agent).not.toHaveProperty('activeProviderId');
    expect(result.agent).not.toHaveProperty('activeModelId');
    expect(result.agent).not.toHaveProperty('providerConfigs');
  });

  it('preserves customModelId on explicit connections', () => {
    const result = parseSettings({
      agent: {
        activeConnectionId: 'openai-default',
        connections: [
          {
            id: 'openai-default',
            specId: 'openai',
            name: 'OpenAI',
            modelKey: 'openai:gpt-5.4',
            customModelId: 'gpt-oss-120b',
            auth: { type: 'apiKey' },
          },
        ],
      },
    });

    expect(result.agent.connections).toEqual([
      expect.objectContaining({
        id: 'openai-default',
        modelKey: 'openai:gpt-5.4',
        customModelId: 'gpt-oss-120b',
      }),
    ]);
  });

  it('migrates legacy compaction.enabled into autoCompact', () => {
    const result = parseSettings({
      agent: {
        compaction: {
          enabled: false,
          reserveTokens: 4096,
          keepRecentTokens: 6000,
        },
      },
    });

    expect(result.agent.compaction).toEqual({
      reserveTokens: 4096,
      keepRecentTokens: 6000,
      autoCompact: false,
    });
    expect(result.agent.compaction).not.toHaveProperty('enabled');
  });

  it('fills defaults for missing fields', () => {
    const result = parseSettings({ theme: 'light' });
    expect(result.theme).toBe('light');
    expect(result.language).toBe('en');
    expect(result.agent).toEqual(DEFAULT_AGENT_SETTINGS);
  });

  it('migrates top-level legacy providers into connections', () => {
    const result = parseSettings({
      providers: [
        {
          id: 'anthropic-default',
          provider: 'anthropic',
          apiType: 'anthropic-messages',
          name: 'Anthropic',
          apiKey: 'sk-ant-xxx',
          modelId: 'claude-opus-4-6',
        },
        {
          id: 'openai-default',
          provider: 'openai',
          apiType: 'openai-completions',
          name: 'OpenAI',
          apiKey: 'sk-oai-xxx',
          baseUrl: 'https://custom.api.com',
          modelId: 'gpt-5.4',
        },
      ],
      agent: {
        activeProviderId: 'openai-default',
      },
    });

    expect(result.agent.activeConnectionId).toBe('openai-default');
    expect(result.agent.connections).toEqual([
      expect.objectContaining({
        id: 'anthropic-default',
        specId: 'claude',
        name: 'Anthropic',
        apiKey: 'sk-ant-xxx',
        modelKey: 'anthropic:claude-opus-4-6',
        auth: { type: 'apiKey' },
      }),
      expect.objectContaining({
        id: 'openai-default',
        specId: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://custom.api.com',
        apiKey: 'sk-oai-xxx',
        modelKey: 'openai:gpt-5.4',
        auth: { type: 'apiKey' },
      }),
    ]);
  });

  it('migrates legacy agent.providerConfigs when no connections exist', () => {
    const result = parseSettings({
      agent: {
        activeProviderId: 'codex-1',
        providerConfigs: [
          {
            id: 'codex-1',
            name: 'Codex',
            provider: 'openai-codex',
            apiType: 'openai-codex-responses',
            baseUrl: 'https://chatgpt.com/backend-api/codex',
            modelId: 'gpt-5.3-codex',
            auth: { type: 'oauth', strategy: 'openai-codex' },
          },
        ],
      },
    });

    expect(result.agent.activeConnectionId).toBe('codex-1');
    expect(result.agent.connections).toEqual([
      expect.objectContaining({
        id: 'codex-1',
        specId: 'codex',
        name: 'Codex',
        modelKey: 'openai-codex:gpt-5.3-codex',
        auth: { type: 'oauth' },
      }),
    ]);
  });

  it('migrates unknown legacy model ids into customModelId while keeping a catalog baseline', () => {
    const result = parseSettings({
      agent: {
        activeProviderId: 'openai-custom',
        providerConfigs: [
          {
            id: 'openai-custom',
            name: 'OpenAI Custom',
            provider: 'openai',
            apiType: 'openai-completions',
            modelId: 'gpt-oss-120b',
          },
        ],
      },
    });

    expect(result.agent.activeConnectionId).toBe('openai-custom');
    expect(result.agent.connections).toEqual([
      expect.objectContaining({
        id: 'openai-custom',
        specId: 'openai',
        modelKey: 'openai:gpt-5.4',
        customModelId: 'gpt-oss-120b',
      }),
    ]);
  });

  it('prefers explicit connections over legacy provider configs', () => {
    const result = parseSettings({
      agent: {
        activeConnectionId: 'openai-live',
        connections: [
          {
            id: 'openai-live',
            specId: 'openai',
            name: 'OpenAI Live',
            modelKey: 'openai:gpt-5.2',
            auth: { type: 'apiKey' },
          },
        ],
        providerConfigs: [
          {
            id: 'ignored',
            name: 'Ignored',
            provider: 'anthropic',
            apiType: 'anthropic-messages',
            modelId: 'claude-opus-4-6',
          },
        ],
      },
    });

    expect(result.agent.activeConnectionId).toBe('openai-live');
    expect(result.agent.connections).toEqual([
      expect.objectContaining({
        id: 'openai-live',
        specId: 'openai',
        modelKey: 'openai:gpt-5.2',
      }),
    ]);
  });

  it("migrates thinkingLevel 'minimal' to 'low'", () => {
    const result = parseSettings({
      agent: {
        thinkingLevel: 'minimal',
      },
    });

    expect(result.agent.thinkingLevel).toBe('low');
  });

  it('removes deprecated and compatibility fields from the parsed output', () => {
    const result = parseSettings({
      defaultWorkspace: '/tmp/old',
      workspaces: [
        { name: 'Workspace A', path: '/tmp/a' },
        { id: 'ws_custom', name: 'Workspace B', path: '/tmp/b', isDefault: true },
      ],
      agent: {
        activeProviderId: 'legacy',
        activeModelId: 'legacy-model',
        providerConfigs: [],
        thinkingBudget: 2048,
        customSystemPrompt: 'legacy',
      },
    });

    expect((result as Record<string, unknown>).defaultWorkspace).toBeUndefined();
    expect((result.agent as Record<string, unknown>).thinkingBudget).toBeUndefined();
    expect((result.agent as Record<string, unknown>).customSystemPrompt).toBeUndefined();
    expect(result.agent).not.toHaveProperty('activeProviderId');
    expect(result.agent).not.toHaveProperty('activeModelId');
    expect(result.agent).not.toHaveProperty('providerConfigs');
    expect(result.workspaces).toEqual([
      expect.objectContaining({ id: 'ws_0', isDefault: false }),
      expect.objectContaining({ id: 'ws_custom', isDefault: true }),
    ]);
  });

  it('returns defaults when enum validation fails', () => {
    expect(parseSettings({ theme: 'blue' }).theme).toBe(DEFAULT_SETTINGS.theme);
    expect(parseSettings({ language: 'jp' }).language).toBe(DEFAULT_SETTINGS.language);
    expect(parseSettings({ agent: { thinkingLevel: 'ultra' } })).toEqual(DEFAULT_SETTINGS);
  });
});
