import { describe, expect, it, vi } from 'vitest';
import { parseSettings } from '@shared/schemas';
import { sanitizeSettingsConnections } from '@/main/auth/connection-credentials';

describe('sanitizeSettingsConnections', () => {
  it('stores entered api keys in secure storage and replaces them with credential ids', async () => {
    const credentialStore = {
      setApiKey: vi.fn(async () => undefined),
      deleteApiKey: vi.fn(async () => undefined),
    };

    const current = parseSettings({});
    const next = parseSettings({
      agent: {
        activeConnectionId: 'openai-default',
        connections: [
          {
            id: 'openai-default',
            specId: 'openai',
            name: 'OpenAI',
            apiKey: 'sk-new',
            modelKey: 'openai:gpt-5.4',
            auth: { type: 'apiKey' },
          },
        ],
      },
    });

    const result = await sanitizeSettingsConnections(current, next, credentialStore);

    expect(result.changed).toBe(true);
    expect(credentialStore.setApiKey).toHaveBeenCalledWith('connection:openai-default', 'sk-new');
    expect(result.settings.agent.connections).toEqual([
      expect.objectContaining({
        id: 'openai-default',
        apiKey: '',
        auth: { type: 'apiKey', credentialId: 'connection:openai-default' },
      }),
    ]);
  });

  it('preserves existing credential ids when the form sends back an empty api key', async () => {
    const credentialStore = {
      setApiKey: vi.fn(async () => undefined),
      deleteApiKey: vi.fn(async () => undefined),
    };

    const current = parseSettings({
      agent: {
        activeConnectionId: 'openai-default',
        connections: [
          {
            id: 'openai-default',
            specId: 'openai',
            name: 'OpenAI',
            modelKey: 'openai:gpt-5.4',
            auth: { type: 'apiKey', credentialId: 'cred-1' },
          },
        ],
      },
    });

    const next = parseSettings({
      agent: {
        activeConnectionId: 'openai-default',
        connections: [
          {
            id: 'openai-default',
            specId: 'openai',
            name: 'OpenAI',
            modelKey: 'openai:gpt-5.4',
            auth: { type: 'apiKey' },
          },
        ],
      },
    });

    const result = await sanitizeSettingsConnections(current, next, credentialStore);

    expect(result.changed).toBe(true);
    expect(credentialStore.setApiKey).not.toHaveBeenCalled();
    expect(credentialStore.deleteApiKey).not.toHaveBeenCalled();
    expect(result.settings.agent.connections[0]?.auth).toEqual({
      type: 'apiKey',
      credentialId: 'cred-1',
    });
  });

  it('deletes stored credentials when an api key connection is removed', async () => {
    const credentialStore = {
      setApiKey: vi.fn(async () => undefined),
      deleteApiKey: vi.fn(async () => undefined),
    };

    const current = parseSettings({
      agent: {
        activeConnectionId: 'openai-default',
        connections: [
          {
            id: 'openai-default',
            specId: 'openai',
            name: 'OpenAI',
            modelKey: 'openai:gpt-5.4',
            auth: { type: 'apiKey', credentialId: 'cred-1' },
          },
        ],
      },
    });

    const next = parseSettings({
      agent: {
        connections: [],
      },
    });

    const result = await sanitizeSettingsConnections(current, next, credentialStore);

    expect(result.changed).toBe(true);
    expect(credentialStore.deleteApiKey).toHaveBeenCalledWith('cred-1');
  });
});
