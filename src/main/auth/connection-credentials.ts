import { AI_CATALOG } from '@shared/ai-catalog.generated';
import { getConnectionSpec } from '@shared/ai-catalog';
import type { ConnectionConfig, Settings } from '@shared/schemas';

export interface ApiKeyCredentialStore {
  setApiKey(credentialId: string, apiKey: string): Promise<void>;
  deleteApiKey(credentialId: string): Promise<void>;
}

function getCredentialId(connection: ConnectionConfig | undefined): string | undefined {
  if (!connection || connection.auth.type !== 'apiKey') {
    return undefined;
  }

  return connection.auth.credentialId ?? undefined;
}

function toCredentialId(connectionId: string): string {
  return `connection:${connectionId}`;
}

export async function sanitizeSettingsConnections(
  current: Settings,
  next: Settings,
  credentialStore: ApiKeyCredentialStore,
): Promise<{ settings: Settings; changed: boolean }> {
  const currentConnections = new Map(
    current.agent.connections.map((connection) => [connection.id, connection]),
  );

  let changed = false;

  const nextConnections = await Promise.all(next.agent.connections.map(async (connection) => {
    const existing = currentConnections.get(connection.id);
    const serviceAuth = AI_CATALOG.services[getConnectionSpec(connection.specId).serviceId].auth;

    if (serviceAuth.type !== 'apiKey') {
      if (connection.apiKey) {
        changed = true;
        return { ...connection, apiKey: '' };
      }
      return connection;
    }

    const existingCredentialId = getCredentialId(existing);
    const inputCredentialId = connection.auth.type === 'apiKey'
      ? connection.auth.credentialId ?? undefined
      : undefined;

    if (connection.apiKey.trim()) {
      const credentialId = inputCredentialId || existingCredentialId || toCredentialId(connection.id);
      await credentialStore.setApiKey(credentialId, connection.apiKey.trim());
      changed = true;
      const normalized: ConnectionConfig = {
        ...connection,
        apiKey: '',
        auth: { type: 'apiKey', credentialId },
      };
      return normalized;
    }

    const credentialId = inputCredentialId || existingCredentialId;
    const normalized: ConnectionConfig = {
      ...connection,
      apiKey: '',
      auth: credentialId
        ? { type: 'apiKey', credentialId }
        : { type: 'apiKey' },
    };

    if (
      connection.apiKey !== '' ||
      connection.auth.type !== 'apiKey' ||
      inputCredentialId !== credentialId
    ) {
      changed = true;
    }

    return normalized;
  }));

  const nextConnectionsById = new Map(nextConnections.map((connection) => [connection.id, connection]));
  for (const existing of current.agent.connections) {
    const existingCredentialId = getCredentialId(existing);
    if (!existingCredentialId) {
      continue;
    }

    const nextConnection = nextConnectionsById.get(existing.id);
    const nextCredentialId = getCredentialId(nextConnection);
    if (nextCredentialId !== existingCredentialId) {
      await credentialStore.deleteApiKey(existingCredentialId);
      changed = true;
    }
  }

  if (!changed) {
    return { settings: next, changed: false };
  }

  return {
    changed: true,
    settings: {
      ...next,
      agent: {
        ...next.agent,
        connections: nextConnections,
      },
    },
  };
}
