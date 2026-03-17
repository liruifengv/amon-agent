import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

import { AuthStore } from '@/main/auth/auth-store';
import { SecureStorage } from '@/main/auth/secure-storage';

let tempDir: string;
let authPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amon-auth-'));
  authPath = join(tempDir, 'provider-sessions.json');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe('SecureStorage', () => {
  it('writes and reads plaintext JSON when encryption is unavailable', async () => {
    const storage = new SecureStorage(authPath, {
      isEncryptionAvailable: () => false,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString('utf-8'),
    });

    await storage.writeJson({ hello: 'world' });

    const raw = await readFile(authPath, 'utf-8');
    expect(raw).toContain('"hello": "world"');
    expect(await storage.readJson({})).toEqual({ hello: 'world' });
  });

  it('writes encrypted JSON when safeStorage is available', async () => {
    const storage = new SecureStorage(authPath, {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf-8'),
      decryptString: (value: Buffer) => value.toString('utf-8').replace(/^enc:/, ''),
    });

    await storage.writeJson({ secret: 'token' });

    const raw = await readFile(authPath, 'utf-8');
    expect(raw.startsWith('enc:')).toBe(true);
    expect(raw).not.toContain('"secret": "token"');
    expect(await storage.readJson({})).toEqual({ secret: 'token' });
  });
});

describe('AuthStore', () => {
  it('persists sessions by provider config id', async () => {
    const store = new AuthStore(new SecureStorage(authPath));

    await store.setSession({
      providerConfigId: 'codex-1',
      strategy: 'openai-codex',
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
    });

    expect(await store.getSession('codex-1')).toEqual(
      expect.objectContaining({
        providerConfigId: 'codex-1',
        accessToken: 'token-1',
      }),
    );
    expect(await store.listSessions()).toHaveLength(1);

    await store.deleteSession('codex-1');
    expect(await store.getSession('codex-1')).toBeUndefined();
  });
});
