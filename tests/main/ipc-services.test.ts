import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { SessionStore } from '@/main/store/session-store';
import type { IpcDependencies } from '@/main/ipc/services';

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler);
    }),
    removeHandler: vi.fn(),
  },
  BrowserWindow: class BrowserWindow {},
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
    openExternal: vi.fn(),
  },
  app: {
    getVersion: vi.fn(() => '0.0.0-test'),
  },
}));

import { registerIpcHandlers } from '@/main/ipc/services';

function createDeps(sessionStore: SessionStore) {
  return {
    agentService: {
      sendMessage: vi.fn(),
      abort: vi.fn(),
      removeAgent: vi.fn(),
    },
    sessionStore,
    persistence: {
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      appendMetaUpdate: vi.fn(),
    },
    configStore: {
      getSettings: vi.fn(async () => ({
        agent: {
          defaultApprovalMode: 'ask',
          connections: [],
          activeConnectionId: null,
        },
        workspaces: [],
      })),
      updateSettings: vi.fn(),
    },
    connectionAuthService: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getStatuses: vi.fn(),
    },
    credentialStore: {},
    pushService: {
      pushSettingsChanged: vi.fn(),
    },
    approvalService: {
      respond: vi.fn(),
    },
    questionService: {
      respond: vi.fn(),
    },
    getMainWindow: vi.fn(() => null),
    getSettingsWindow: vi.fn(() => null),
    createSettingsWindow: vi.fn(),
  } as unknown as IpcDependencies;
}

describe('registerIpcHandlers workspace handlers', () => {
  let workspaceDir: string;

  beforeEach(async () => {
    registeredHandlers.clear();
    workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'amon-workspace-'));

    await mkdir(path.join(workspaceDir, 'src'), { recursive: true });
    await mkdir(path.join(workspaceDir, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(path.join(workspaceDir, '.git'), { recursive: true });
    await writeFile(path.join(workspaceDir, 'src', 'index.ts'), 'export const ok = true;\n');
    await writeFile(path.join(workspaceDir, 'README.md'), '# workspace\n');
    await writeFile(path.join(workspaceDir, 'node_modules', 'pkg', 'index.js'), 'ignored\n');
    await writeFile(path.join(workspaceDir, '.git', 'config'), 'ignored\n');
  });

  afterEach(async () => {
    registeredHandlers.clear();
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it('lists files from the session workspace instead of returning an empty list', async () => {
    const sessionStore = new SessionStore();
    sessionStore.createSession({
      id: 'session-1',
      title: 'Session',
      workspace: workspaceDir,
      approvalMode: 'ask',
      createdAt: 1,
      updatedAt: 1,
    });

    registerIpcHandlers(createDeps(sessionStore));

    const handler = registeredHandlers.get('workspace.listFiles');
    expect(handler).toBeTypeOf('function');

    const files = await handler?.(undefined, 'session-1', 'index', 10) as Array<{ path: string }>;
    expect(files).toEqual([
      expect.objectContaining({ path: 'src/index.ts' }),
    ]);
  });

  it('validates mentioned paths against the selected workspace', async () => {
    const sessionStore = new SessionStore();
    registerIpcHandlers(createDeps(sessionStore));

    const handler = registeredHandlers.get('workspace.validatePaths');
    expect(handler).toBeTypeOf('function');

    const results = await handler?.(
      undefined,
      workspaceDir,
      ['src/index.ts', 'README.md', 'missing.ts'],
    ) as boolean[];

    expect(results).toEqual([true, true, false]);
  });
});
