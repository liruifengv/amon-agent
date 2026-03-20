import type { Model } from '../../ai';
import { resolveCatalogBinding } from '@shared/ai-catalog';
import type { ConnectionConfig } from '@shared/schemas';

export function resolveRuntimeModel(connection: ConnectionConfig): Model<any> {
  const { spec, model, availability } = resolveCatalogBinding(connection.specId, connection.modelKey);
  const customModelId = connection.customModelId?.trim();

  const resolvedBaseUrl = spec.baseUrlMode === 'fixed'
    ? spec.defaultBaseUrl
    : connection.baseUrl?.trim() || spec.defaultBaseUrl;

  if (spec.baseUrlMode === 'required' && !connection.baseUrl?.trim()) {
    throw new Error(`Connection "${connection.name}" requires a Base URL`);
  }

  if (!resolvedBaseUrl) {
    throw new Error(`Connection "${connection.name}" could not resolve a Base URL`);
  }

  return {
    id: customModelId || (availability.modelIdOverride ?? model.modelId),
    name: customModelId || model.name,
    api: spec.transport,
    provider: model.serviceId,
    baseUrl: resolvedBaseUrl,
    reasoning: model.capabilities.reasoning,
    thinkingLevels: model.capabilities.thinkingLevels,
    input: [...model.capabilities.input],
    cost: model.pricing ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: model.limits.contextWindow,
    maxTokens: availability.maxOutputTokensOverride ?? model.limits.maxOutputTokens,
    compat: availability.compat as Model<any>['compat'],
  };
}
