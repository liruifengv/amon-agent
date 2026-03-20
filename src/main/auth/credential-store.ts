import { SecureStorage } from './secure-storage';

interface CredentialStoreData {
  apiKeys: Record<string, string>;
}

const EMPTY_STORE: CredentialStoreData = {
  apiKeys: {},
};

export class CredentialStore {
  constructor(private readonly storage: SecureStorage) {}

  async getApiKey(credentialId: string): Promise<string | undefined> {
    const data = await this.read();
    return data.apiKeys[credentialId];
  }

  async setApiKey(credentialId: string, apiKey: string): Promise<void> {
    const data = await this.read();
    data.apiKeys[credentialId] = apiKey;
    await this.storage.writeJson(data);
  }

  async deleteApiKey(credentialId: string): Promise<void> {
    const data = await this.read();
    if (!data.apiKeys[credentialId]) {
      return;
    }

    delete data.apiKeys[credentialId];
    await this.storage.writeJson(data);
  }

  private async read(): Promise<CredentialStoreData> {
    const data = await this.storage.readJson<CredentialStoreData>(EMPTY_STORE);
    return {
      apiKeys: { ...data.apiKeys },
    };
  }
}
