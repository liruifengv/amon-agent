import http from 'node:http';
import { URL } from 'node:url';

export interface OAuthCallbackPayload {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface LoopbackServerHandle {
  waitForCallback(timeoutMs?: number): Promise<OAuthCallbackPayload>;
  close(): Promise<void>;
}

export async function createLoopbackServer(
  port: number,
  callbackPath: string,
): Promise<LoopbackServerHandle> {
  let closed = false;
  let settleCallback: ((value: OAuthCallbackPayload) => void) | null = null;
  let rejectCallback: ((reason?: unknown) => void) | null = null;

  const callbackPromise = new Promise<OAuthCallbackPayload>((resolve, reject) => {
    settleCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (requestUrl.pathname !== callbackPath) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const payload: OAuthCallbackPayload = {
      code: requestUrl.searchParams.get('code') || undefined,
      state: requestUrl.searchParams.get('state') || undefined,
      error: requestUrl.searchParams.get('error') || undefined,
      errorDescription: requestUrl.searchParams.get('error_description') || undefined,
    };

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<html><body><h1>Amon authentication complete</h1><p>You can return to the app.</p></body></html>');

    settleCallback?.(payload);
    void close();
  });

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    async waitForCallback(timeoutMs = 5 * 60 * 1000): Promise<OAuthCallbackPayload> {
      const timeout = setTimeout(() => {
        rejectCallback?.(new Error('OAuth callback timed out'));
        void close();
      }, timeoutMs);

      try {
        return await callbackPromise;
      } finally {
        clearTimeout(timeout);
      }
    },
    close,
  };
}
