import { createHash, randomBytes } from 'node:crypto';
import type { ProviderConfig } from '@shared/schemas';
import type { AuthSession, ResolvedRequestAuth } from '@shared/provider-auth';
import { createLogger } from '../../store/logger';
import { createLoopbackServer, type LoopbackServerHandle } from '../loopback-server';
import type { AuthStrategy } from '../types';

const log = createLogger('OpenAICodexAuth');

const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = '/auth/callback';
const OAUTH_SCOPE = 'openid profile email offline_access';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface OpenAICodexAuthDeps {
  fetchImpl?: typeof fetch;
  openExternal?: (url: string) => Promise<void>;
  createLoopbackServer?: (port: number, callbackPath: string) => Promise<LoopbackServerHandle>;
}

export class OpenAICodexAuthStrategy implements AuthStrategy {
  readonly id = 'openai-codex';
  private readonly fetchImpl: typeof fetch;
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly loopbackFactory: (port: number, callbackPath: string) => Promise<LoopbackServerHandle>;

  constructor(deps: OpenAICodexAuthDeps = {}) {
    this.fetchImpl = deps.fetchImpl || fetch;
    this.openExternal = deps.openExternal || (async () => undefined);
    this.loopbackFactory = deps.createLoopbackServer || createLoopbackServer;
  }

  async connect(providerConfig: ProviderConfig): Promise<AuthSession> {
    const state = randomBytes(16).toString('hex');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = sha256Base64Url(codeVerifier);
    const server = await this.loopbackFactory(CALLBACK_PORT, CALLBACK_PATH);

    try {
      const authorizeUrl = new URL(AUTHORIZE_URL);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', CLIENT_ID);
      authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authorizeUrl.searchParams.set('scope', OAUTH_SCOPE);
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('id_token_add_organizations', 'true');
      authorizeUrl.searchParams.set('codex_cli_simplified_flow', 'true');

      await this.openExternal(authorizeUrl.toString());

      const callback = await server.waitForCallback();
      if (callback.error) {
        throw new Error(callback.errorDescription || callback.error);
      }
      if (!callback.code || callback.state !== state) {
        throw new Error('OAuth callback validation failed');
      }

      const token = await this.exchangeToken(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: callback.code,
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      );

      return buildAuthSession(providerConfig.id, this.id, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('EADDRINUSE')) {
        throw new Error('Port 1455 is already in use. Close any existing Codex login flow and try again.');
      }
      throw error;
    } finally {
      await server.close();
    }
  }

  async refresh(session: AuthSession): Promise<AuthSession> {
    if (!session.refreshToken) {
      throw new Error('Codex OAuth session is missing a refresh token');
    }

    const token = await this.exchangeToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: CLIENT_ID,
      }),
    );

    return {
      ...buildAuthSession(session.providerConfigId, this.id, token),
      metadata: {
        ...session.metadata,
      },
    };
  }

  async disconnect(): Promise<void> {
    return undefined;
  }

  async resolveRequestAuth(session: AuthSession, providerConfig: ProviderConfig): Promise<ResolvedRequestAuth> {
    return {
      accessToken: session.accessToken,
      baseUrl: providerConfig.baseUrl,
    };
  }

  private async exchangeToken(body: URLSearchParams): Promise<TokenResponse> {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await response.text();
    let payload: TokenResponse;
    try {
      payload = JSON.parse(text) as TokenResponse;
    } catch {
      throw new Error(`Failed to parse OpenAI OAuth response: ${text}`);
    }

    if (!response.ok || payload.error || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || `OpenAI OAuth request failed with ${response.status}`);
    }

    return payload;
  }
}

function buildAuthSession(providerConfigId: string, strategy: string, token: TokenResponse): AuthSession {
  const accountLabel = parseAccountLabel(token.id_token);
  const expiresAt = typeof token.expires_in === 'number'
    ? Date.now() + token.expires_in * 1000
    : undefined;

  return {
    providerConfigId,
    strategy,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    accountLabel,
    metadata: token.id_token ? { idToken: token.id_token } : undefined,
  };
}

function parseAccountLabel(idToken?: string): string | undefined {
  if (!idToken) return undefined;

  try {
    const payloadPart = idToken.split('.')[1];
    if (!payloadPart) return undefined;
    const json = Buffer.from(normalizeBase64Url(payloadPart), 'base64').toString('utf-8');
    const payload = JSON.parse(json) as Record<string, unknown>;
    return (payload.email as string) || (payload.preferred_username as string) || (payload.sub as string) || undefined;
  } catch (error) {
    log.warn('Failed to decode id_token for account label', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function sha256Base64Url(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

function normalizeBase64Url(value: string): string {
  const replaced = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = replaced.length % 4 === 0 ? '' : '='.repeat(4 - (replaced.length % 4));
  return `${replaced}${padding}`;
}
