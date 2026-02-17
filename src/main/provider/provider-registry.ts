import type {
  ProviderAdapter,
  ProviderInfo,
} from '@shared/provider-types';
import { AnthropicAdapter } from './anthropic-adapter';
import { OpenAIAdapter } from './openai-adapter';

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
}

// ---------------------------------------------------------------------------
// Factory: create a registry pre-populated with all configured providers
// ---------------------------------------------------------------------------

export async function createDefaultProviderRegistry(
  configStore: ConfigStoreLike,
): Promise<ProviderRegistry> {
  const registry = new ProviderRegistry();
  const settings = await configStore.getSettings();
  const providerConfigs = settings.agent?.providerConfigs ?? [];

  for (const config of providerConfigs) {
    const apiKey = config.apiKey || configStore.getApiKey(config.id);
    if (!apiKey) continue;

    const type = config.type || 'openai';

    if (type === 'anthropic') {
      registry.register(
        new AnthropicAdapter(apiKey, config.baseUrl, config.id),
      );
    } else {
      registry.register(
        new OpenAIAdapter(apiKey, config.baseUrl, config.id),
      );
    }
  }

  return registry;
}
