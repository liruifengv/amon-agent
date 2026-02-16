import {
  getModel as piGetModel,
  getModels as piGetModels,
  getProviders as piGetProviders,
  getEnvApiKey,
  type Model,
  type Api,
} from '@mariozechner/pi-ai';
import type { AgentSettings } from '../../shared/schemas';

/**
 * ModelManager: Encapsulates pi-ai model retrieval and API Key resolution.
 *
 * Responsibilities:
 * - Get the active model object from settings
 * - Resolve API Key (Settings first, env var fallback)
 * - List available providers and models
 * - Apply custom baseUrl overrides
 */
export class ModelManager {
  /**
   * Get the model configured in current settings.
   * Returns null if the provider/modelId combination is not found in pi-ai registry.
   */
  getActiveModel(settings: AgentSettings): Model<Api> | null {
    const { activeProvider, activeModelId } = settings;
    const model = piGetModel(activeProvider as any, activeModelId as any);
    if (!model) {
      return null;
    }

    // Apply custom baseUrl override if configured
    const providerConfig = settings.providerConfigs.find(
      (c) => c.provider === activeProvider
    );
    if (providerConfig?.baseUrl) {
      let baseUrl = providerConfig.baseUrl.replace(/\/+$/, ''); // trim trailing slashes
      // Anthropic SDK appends /v1/messages internally, so baseUrl must NOT end with /v1.
      // Many proxy providers advertise URLs like https://example.com/v1, which would cause
      // double /v1 → 404. Auto-strip for anthropic-messages API type.
      if (model.api === 'anthropic-messages' && baseUrl.endsWith('/v1')) {
        baseUrl = baseUrl.slice(0, -3);
      }
      return { ...model, baseUrl };
    }

    return model;
  }

  /**
   * Get API Key for a given provider.
   * Priority: Settings providerConfigs > environment variable (via pi-ai getEnvApiKey).
   */
  getApiKey(provider: string, settings: AgentSettings): string | undefined {
    // 1. Check Settings providerConfigs
    const config = settings.providerConfigs.find((c) => c.provider === provider);
    if (config?.apiKey) {
      return config.apiKey;
    }

    // 2. Fallback to environment variable
    return getEnvApiKey(provider);
  }

  /**
   * Get all available provider identifiers from pi-ai registry.
   */
  getAvailableProviders(): string[] {
    return piGetProviders();
  }

  /**
   * Get all models for a given provider from pi-ai registry.
   */
  getAvailableModels(provider: string): Model<Api>[] {
    return piGetModels(provider as any);
  }

  /**
   * Check if a provider has a valid API Key configured
   * (either in Settings or via environment variable).
   */
  isProviderConfigured(provider: string, settings: AgentSettings): boolean {
    return !!this.getApiKey(provider, settings);
  }
}

export const modelManager = new ModelManager();
