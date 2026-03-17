import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../store/logger';

const log = createLogger('SecureStorage');
const ENCRYPTED_PREFIX = 'enc:';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class SecureStorage {
  constructor(
    private readonly filePath: string,
    private readonly safeStorage?: SafeStorageLike,
  ) {}

  async readJson<T>(fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      if (raw.startsWith(ENCRYPTED_PREFIX)) {
        if (!this.safeStorage?.isEncryptionAvailable()) {
          log.warn('Encrypted storage file cannot be decrypted because safeStorage is unavailable', {
            filePath: this.filePath,
          });
          return fallback;
        }

        const payload = raw.slice(ENCRYPTED_PREFIX.length);
        const decrypted = this.safeStorage.decryptString(Buffer.from(payload, 'base64'));
        return JSON.parse(decrypted) as T;
      }

      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('Failed to read secure storage file, using fallback', {
          filePath: this.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return fallback;
    }
  }

  async writeJson(value: unknown): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    const json = JSON.stringify(value, null, 2);
    const encrypted = this.safeStorage?.isEncryptionAvailable() ?? false;
    const encryptedPayload = encrypted && this.safeStorage
      ? `${ENCRYPTED_PREFIX}${this.safeStorage.encryptString(json).toString('base64')}`
      : undefined;
    const payload = encryptedPayload ?? json;

    if (!encrypted) {
      log.warn('safeStorage is unavailable; writing provider auth sessions as plaintext with restricted permissions', {
        filePath: this.filePath,
      });
    }

    await writeFile(tmpPath, payload, 'utf-8');
    await chmod(tmpPath, 0o600).catch(() => undefined);
    await rename(tmpPath, this.filePath);
    await chmod(this.filePath, 0o600).catch(() => undefined);
  }
}
