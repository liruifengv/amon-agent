import type { AuthSession } from '@shared/connection-auth';
import { SecureStorage } from './secure-storage';

interface AuthStoreData {
  sessions: Record<string, AuthSession>;
}

const EMPTY_STORE: AuthStoreData = {
  sessions: {},
};

export class AuthStore {
  constructor(private readonly storage: SecureStorage) {}

  async listSessions(): Promise<AuthSession[]> {
    const data = await this.read();
    return Object.values(data.sessions);
  }

  async getSession(connectionId: string): Promise<AuthSession | undefined> {
    const data = await this.read();
    return data.sessions[connectionId];
  }

  async setSession(session: AuthSession): Promise<void> {
    const data = await this.read();
    const sessionKey = session.connectionId || session.providerConfigId;
    if (!sessionKey) {
      throw new Error('Auth session is missing a connection id');
    }
    data.sessions[sessionKey] = {
      ...session,
      connectionId: session.connectionId || session.providerConfigId,
    };
    await this.storage.writeJson(data);
  }

  async deleteSession(connectionId: string): Promise<void> {
    const data = await this.read();
    if (!data.sessions[connectionId]) {
      return;
    }

    delete data.sessions[connectionId];
    await this.storage.writeJson(data);
  }

  private async read(): Promise<AuthStoreData> {
    const data = await this.storage.readJson<AuthStoreData>(EMPTY_STORE);
    return {
      sessions: { ...data.sessions },
    };
  }
}
