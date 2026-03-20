import { promises as fs } from 'fs';
import path from 'path';
import { AI_CATALOG } from '@shared/ai-catalog.generated';
import { getConnectionSpec } from '@shared/ai-catalog';
import { Settings, SettingsSchema, DEFAULT_SETTINGS, parseSettings } from '@shared/schemas';
import { createLogger } from './logger';

const log = createLogger('ConfigStore');

export class ConfigStore {
  private settingsPath: string;
  private cachedSettings: Settings | null = null;

  constructor(settingsPath: string) {
    this.settingsPath = settingsPath;
  }

  /**
   * Get current settings. Reads from disk on first call, then uses cache.
   * Falls back to DEFAULT_SETTINGS if file is missing or invalid.
   */
  async getSettings(): Promise<Settings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    try {
      const content = await fs.readFile(this.settingsPath, 'utf-8');
      const rawData = JSON.parse(content);
      const parsed = parseSettings(rawData);
      this.cachedSettings = parsed;

      // Rewrite legacy or redundant fields out of settings.json after a successful read.
      if (JSON.stringify(rawData) !== JSON.stringify(parsed)) {
        await this.writeSettings(parsed);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        log.warn('Settings file contains invalid JSON', { error: error.message });
      }
      this.cachedSettings = DEFAULT_SETTINGS;
    }

    return this.cachedSettings;
  }

  /**
   * Update settings with a partial object.
   * Deep-merges with current settings, validates via Zod, and writes atomically.
   */
  async updateSettings(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();

    // Deep merge: handle nested objects (agent, shortcuts)
    const merged: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(partial)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof (current as Record<string, unknown>)[key] === 'object' &&
        (current as Record<string, unknown>)[key] !== null
      ) {
        merged[key] = {
          ...(current as Record<string, unknown>)[key] as Record<string, unknown>,
          ...value as Record<string, unknown>,
        };
      } else {
        merged[key] = value;
      }
    }

    // Validate the merged result
    const validated = SettingsSchema.parse(merged);
    const normalized = parseSettings(validated);

    await this.writeSettings(normalized);

    this.cachedSettings = normalized;
    log.debug('Settings updated', { keys: Object.keys(partial) });

    return normalized;
  }

  getApiKey(connectionId: string): string | undefined {
    const connection = this.cachedSettings?.agent?.connections.find((item) => item.id === connectionId);
    if (connection?.apiKey?.trim()) {
      return connection.apiKey.trim();
    }

    const serviceId = connection
      ? getConnectionSpec(connection.specId).serviceId
      : connectionId in AI_CATALOG.services
        ? connectionId as keyof typeof AI_CATALOG.services
        : undefined;

    if (!serviceId) {
      return undefined;
    }

    const serviceAuth = AI_CATALOG.services[serviceId].auth;
    if (serviceAuth.type !== 'apiKey') {
      return undefined;
    }

    for (const envKey of serviceAuth.envKeys ?? []) {
      const value = process.env[envKey];
      if (value?.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private async writeSettings(settings: Settings): Promise<void> {
    const dir = path.dirname(this.settingsPath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = this.settingsPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.settingsPath);
  }
}
