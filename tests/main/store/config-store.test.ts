import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/schemas';

vi.mock('@/main/store/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withSession: vi.fn(),
  }),
}));

import { ConfigStore } from '@/main/store/config-store';

let tempDir: string;
let settingsPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amon-config-'));
  settingsPath = join(tempDir, 'settings.json');
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await rm(tempDir, { recursive: true, force: true });
});

describe('ConfigStore', () => {
  it('returns defaults when the settings file is missing or invalid', async () => {
    const missingStore = new ConfigStore(settingsPath);
    expect(await missingStore.getSettings()).toEqual(DEFAULT_SETTINGS);

    await writeFile(settingsPath, '{invalid', 'utf-8');

    const invalidStore = new ConfigStore(settingsPath);
    expect(await invalidStore.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('caches settings after the first successful read', async () => {
    await writeFile(settingsPath, JSON.stringify({ theme: 'dark' }), 'utf-8');
    const store = new ConfigStore(settingsPath);

    const first = await store.getSettings();
    await writeFile(settingsPath, JSON.stringify({ theme: 'light' }), 'utf-8');
    const second = await store.getSettings();

    expect(first.theme).toBe('dark');
    expect(second.theme).toBe('dark');
  });

  it('deep merges updates and writes the validated result atomically', async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({
        theme: 'dark',
        agent: {
          activeConnectionId: 'openai-default',
          connections: [
            {
              id: 'openai-default',
              specId: 'openai',
              name: 'OpenAI',
              apiKey: 'settings-key',
              modelKey: 'openai:gpt-5.4',
              auth: { type: 'apiKey' },
            },
          ],
          maxTurns: 50,
        },
        skills: {
          extraDirs: ['.claude', '.custom'],
          disabledSkills: ['legacy'],
          initialized: false,
        },
      }),
      'utf-8',
    );

    const store = new ConfigStore(settingsPath);
    const updated = await store.updateSettings({
      agent: {
        ...DEFAULT_SETTINGS.agent,
        ...(await store.getSettings()).agent,
        maxTurns: 99,
      },
      skills: {
        ...DEFAULT_SETTINGS.skills,
        ...(await store.getSettings()).skills,
        initialized: true,
      },
    });

    expect(updated.theme).toBe('dark');
    expect(updated.agent.maxTurns).toBe(99);
    expect(updated.agent.connections).toEqual([
      expect.objectContaining({
        id: 'openai-default',
        name: 'OpenAI',
        apiKey: 'settings-key',
        modelKey: 'openai:gpt-5.4',
      }),
    ]);
    expect(updated.agent).not.toHaveProperty('providerConfigs');
    expect(updated.agent).not.toHaveProperty('activeProviderId');
    expect(updated.agent).not.toHaveProperty('activeModelId');
    expect(updated.skills).toEqual({
      extraDirs: ['.claude', '.custom'],
      disabledSkills: ['legacy'],
      initialized: true,
    });

    const saved = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(saved.agent.maxTurns).toBe(99);
    expect(saved.skills.initialized).toBe(true);
    expect(saved.agent.connections).toHaveLength(1);
    expect(saved.agent.providerConfigs).toBeUndefined();
    expect(saved.agent.activeProviderId).toBeUndefined();
    expect(saved.agent.activeModelId).toBeUndefined();
    expect(await readFile(settingsPath, 'utf-8')).not.toContain('.tmp');
  });

  it('prefers connection api keys and falls back to service environment variables', async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({
        agent: {
          connections: [
            {
              id: 'openai-default',
              specId: 'openai',
              name: 'OpenAI',
              apiKey: 'settings-key',
              modelKey: 'openai:gpt-5.4',
              auth: { type: 'apiKey' },
            },
          ],
        },
      }),
      'utf-8',
    );

    const store = new ConfigStore(settingsPath);
    await store.getSettings();

    process.env.OPENAI_API_KEY = 'env-openai';
    process.env.ANTHROPIC_API_KEY = 'env-anthropic';

    expect(store.getApiKey('openai-default')).toBe('settings-key');
    expect(store.getApiKey('anthropic')).toBe('env-anthropic');
    expect(store.getApiKey('unknown')).toBeUndefined();
  });
});
