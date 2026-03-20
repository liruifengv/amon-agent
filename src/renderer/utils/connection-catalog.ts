import { AI_CATALOG, getConnectionSpec, getResolvedModelName, listModelsForSpec, type ConnectionSpec, type CatalogModel } from '@shared/ai-catalog';
import type { ConnectionConfig } from '../types';

export function getConnectionSpecSafe(specId: string): ConnectionSpec | undefined {
  try {
    return getConnectionSpec(specId);
  } catch {
    return undefined;
  }
}

export function getConnectionModels(specId: string): CatalogModel[] {
  try {
    return listModelsForSpec(specId);
  } catch {
    return [];
  }
}

export function getConnectionIcon(specId: string): string {
  const spec = getConnectionSpecSafe(specId);
  return spec ? AI_CATALOG.services[spec.serviceId].icon : '';
}

export function getConnectionSpecName(specId: string): string {
  return getConnectionSpecSafe(specId)?.name ?? specId;
}

export function getConnectionModelName(modelKey: string, customModelId?: string): string {
  try {
    return getResolvedModelName(modelKey, customModelId);
  } catch {
    return customModelId?.trim() || modelKey;
  }
}

export function getConnectionServiceIcon(connection: ConnectionConfig): string {
  return getConnectionIcon(connection.specId);
}
