import { promises as fs } from 'fs';
import path from 'path';
import { Settings, SettingsSchema, DEFAULT_SETTINGS, parseSettings } from '@shared/schemas';
import { createLogger } from './logger';

const log = createLogger('ConfigStore');

// Environment variable mapping for provider API keys
const ENV_KEY_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

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
      this.cachedSettings = parseSettings(rawData);
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

    // Atomic write: write to temp file, then rename
    const dir = path.dirname(this.settingsPath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = this.settingsPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(validated, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.settingsPath);

    this.cachedSettings = validated;
    log.debug('Settings updated', { keys: Object.keys(partial) });

    return validated;
  }

  /**
   * Get API key for a provider.
   * Priority: settings.agent.providerConfigs > environment variable.
   */
  getApiKey(providerId: string): string | undefined {
    // Check provider configs in cached settings
    const configs = this.cachedSettings?.agent?.providerConfigs;
    if (configs) {
      const config = configs.find((p) => p.id === providerId);
      if (config?.apiKey) {
        return config.apiKey;
      }
    }

    // Fall back to environment variable
    const envVar = ENV_KEY_MAP[providerId];
    if (envVar) {
      return process.env[envVar];
    }

    return undefined;
  }
}
