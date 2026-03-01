import type {
  ProviderAdapter,
  ProviderInfo,
  ServerToolDef,
} from '@shared/provider-types';
import { AnthropicAdapter } from './anthropic-adapter';
import { OpenAIAdapter } from './openai-adapter';

/** Default server tools for direct Anthropic API access. */
const ANTHROPIC_SERVER_TOOLS: ServerToolDef[] = [
  { type: 'web_fetch_20260209', name: 'web_fetch' },
];

// ---------------------------------------------------------------------------
// ConfigStore interface (minimal, avoids circular dependency)
// ---------------------------------------------------------------------------

export interface ConfigStoreLike {
  getApiKey(providerId: string): string | undefined;
  getSettings(): Promise<import('@shared/schemas').Settings>;
}

// ---------------------------------------------------------------------------
// ProviderRegistry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  /** Register a provider adapter. */
  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /** Unregister a provider adapter by id. */
  unregister(providerId: string): void {
    this.adapters.delete(providerId);
  }

  /** Get an adapter by provider id. Throws if not found. */
  getAdapter(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    return adapter;
  }

  /** Check whether a provider is registered. */
  hasAdapter(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  /** List all registered providers. */
  listProviders(): ProviderInfo[] {
    const infos: ProviderInfo[] = [];
    for (const adapter of this.adapters.values()) {
      infos.push({ id: adapter.id, name: adapter.id });
    }
    return infos;
  }

  /** Re-build adapters from config (call after settings change). */
  async syncFromConfig(configStore: ConfigStoreLike): Promise<void> {
    this.adapters.clear();
    const settings = await configStore.getSettings();
    const providerConfigs = settings.agent?.providerConfigs ?? [];

    for (const config of providerConfigs) {
      const apiKey = config.apiKey || configStore.getApiKey(config.id);
      if (!apiKey) continue;

      const type = config.type || 'openai';

      if (type === 'anthropic') {
        // Enable server tools for direct Anthropic API (no custom baseUrl or Anthropic-hosted)
        const isDirectApi = config.modelId?.startsWith('claude');
        this.register(
          new AnthropicAdapter(
            apiKey, config.baseUrl, config.id,
            isDirectApi ? ANTHROPIC_SERVER_TOOLS : undefined,
          ),
        );
      } else {
        this.register(
          new OpenAIAdapter(apiKey, config.baseUrl, config.id),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory: create a registry pre-populated with all configured providers
// ---------------------------------------------------------------------------

export async function createDefaultProviderRegistry(
  configStore: ConfigStoreLike,
): Promise<ProviderRegistry> {
  const registry = new ProviderRegistry();
  await registry.syncFromConfig(configStore);
  return registry;
}
