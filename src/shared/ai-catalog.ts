import {
  AI_CATALOG,
  type AiCatalog,
  type CatalogModel,
  type ConnectionSpec,
  type ServiceId,
  type TransportId,
} from './ai-catalog.generated';

export { AI_CATALOG };
export type {
  AiCatalog,
  CatalogModel,
  ConnectionSpec,
  ServiceId,
  ServiceDef,
  TransportId,
} from './ai-catalog.generated';

export function getCatalog(): AiCatalog {
  return AI_CATALOG;
}

export function listConnectionSpecs(): ConnectionSpec[] {
  return Object.values(AI_CATALOG.connectionSpecs);
}

export function getConnectionSpec(specId: string): ConnectionSpec {
  const spec = AI_CATALOG.connectionSpecs[specId];
  if (!spec) {
    throw new Error(`Unknown connection spec: ${specId}`);
  }
  return spec;
}

export function getCatalogModel(modelKey: string): CatalogModel {
  const model = AI_CATALOG.models[modelKey];
  if (!model) {
    throw new Error(`Unknown catalog model: ${modelKey}`);
  }
  return model;
}

export function getResolvedModelId(modelKey: string, customModelId?: string): string {
  const trimmedCustomModelId = customModelId?.trim();
  if (trimmedCustomModelId) {
    return trimmedCustomModelId;
  }

  return getCatalogModel(modelKey).modelId;
}

export function getResolvedModelName(modelKey: string, customModelId?: string): string {
  const trimmedCustomModelId = customModelId?.trim();
  if (trimmedCustomModelId) {
    return trimmedCustomModelId;
  }

  return getCatalogModel(modelKey).name;
}

export function listModelsForService(serviceId: ServiceId): CatalogModel[] {
  return Object.values(AI_CATALOG.models).filter((model) => model.serviceId === serviceId);
}

export function listModelsForSpec(specId: string): CatalogModel[] {
  const spec = getConnectionSpec(specId);
  return listModelsForService(spec.serviceId).filter((model) => !!model.availability[spec.transport]?.enabled);
}

export function resolveCatalogBinding(specId: string, modelKey: string): {
  spec: ConnectionSpec;
  model: CatalogModel;
  availability: NonNullable<CatalogModel['availability'][TransportId]>;
} {
  const spec = getConnectionSpec(specId);
  const model = getCatalogModel(modelKey);

  if (model.serviceId !== spec.serviceId) {
    throw new Error(`Model "${modelKey}" does not belong to service "${spec.serviceId}"`);
  }

  const availability = model.availability[spec.transport];
  if (!availability?.enabled) {
    throw new Error(`Model "${modelKey}" is not available for transport "${spec.transport}"`);
  }

  return { spec, model, availability };
}

export function getCatalogModelByServiceModelId(serviceId: ServiceId, modelId: string): CatalogModel | undefined {
  return listModelsForService(serviceId).find((model) => model.modelId === modelId);
}
