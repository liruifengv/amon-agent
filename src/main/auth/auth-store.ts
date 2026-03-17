import type { AuthSession } from '@shared/provider-auth';
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

  async getSession(providerConfigId: string): Promise<AuthSession | undefined> {
    const data = await this.read();
    return data.sessions[providerConfigId];
  }

  async setSession(session: AuthSession): Promise<void> {
    const data = await this.read();
    data.sessions[session.providerConfigId] = session;
    await this.storage.writeJson(data);
  }

  async deleteSession(providerConfigId: string): Promise<void> {
    const data = await this.read();
    if (!data.sessions[providerConfigId]) {
      return;
    }

    delete data.sessions[providerConfigId];
    await this.storage.writeJson(data);
  }

  private async read(): Promise<AuthStoreData> {
    const data = await this.storage.readJson<AuthStoreData>(EMPTY_STORE);
    return {
      sessions: { ...data.sessions },
    };
  }
}
