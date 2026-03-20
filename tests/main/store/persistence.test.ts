import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@shared/types';

vi.mock('@/main/store/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withSession: vi.fn(),
  }),
}));

import { Persistence } from '@/main/store/persistence';
import { createAssistantMessage, createToolResultMessage, createUserMessage } from '../../_helpers/mock-messages';

let tempDir: string;

function createSession(overrides: Partial<Session> = {}): Session {
  const { approvalMode = 'ask', ...rest } = overrides;
  return {
    id: 'session-1',
    title: 'Session 1',
    workspace: '/workspace/a',
    approvalMode,
    createdAt: 100,
    updatedAt: 100,
    ...rest,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amon-persistence-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe('Persistence', () => {
  it('replays session records and applies meta updates on load', async () => {
    const persistence = new Persistence(tempDir);
    const session = createSession();
    const user = createUserMessage('hello', { timestamp: 110 });
    const assistant = createAssistantMessage([{ type: 'text', text: 'hi' }], { timestamp: 120 });

    await persistence.createSession(session);
    await persistence.appendMessages(session.id, [user, assistant]);

    vi.spyOn(Date, 'now').mockReturnValue(130);
    await persistence.appendMetaUpdate(session.id, {
      title: 'Renamed',
      workspace: '/workspace/b',
    });

    const loaded = await persistence.loadSession(session.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.session).toEqual({
      id: 'session-1',
      title: 'Renamed',
      workspace: '/workspace/b',
      approvalMode: 'ask',
      createdAt: 100,
      updatedAt: 130,
    });
    expect(loaded?.messages).toEqual([user, assistant]);
  });

  it('rewriteMessages preserves metadata while replacing messages', async () => {
    const persistence = new Persistence(tempDir);
    const session = createSession();
    const oldMessage = createUserMessage('old', { timestamp: 110 });
    const newMessage = createToolResultMessage('tc-1', 'rewritten', { timestamp: 140 });
    const snapshot = {
      summary: 'Goal\n- Keep going.',
      firstKeptMessageIndex: 1,
      tokensBefore: 42000,
      createdAt: 135,
      source: 'auto-threshold' as const,
    };

    await persistence.createSession(session);
    await persistence.appendMessages(session.id, [oldMessage]);

    vi.spyOn(Date, 'now').mockReturnValue(130);
    await persistence.appendMetaUpdate(session.id, { title: 'Updated Title' });
    await persistence.appendCompactionSnapshot(session.id, snapshot);
    await persistence.rewriteMessages(session.id, [newMessage]);

    const fileContent = await readFile(persistence.getPath(session.id), 'utf-8');
    const lines = fileContent.trim().split('\n');
    const recordTypes = lines.map((line) => JSON.parse(line).type);

    expect(recordTypes).toEqual(['session_meta', 'meta_update', 'compaction_snapshot', 'message']);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded?.session.title).toBe('Updated Title');
    expect(loaded?.messages).toEqual([newMessage]);
    expect(loaded?.compactionSnapshot).toEqual(snapshot);
  });

  it('loads the latest compaction snapshot record', async () => {
    const persistence = new Persistence(tempDir);
    const session = createSession();
    const firstSnapshot = {
      summary: 'Goal\n- First.',
      firstKeptMessageIndex: 1,
      tokensBefore: 20000,
      createdAt: 150,
      source: 'auto-threshold' as const,
    };
    const latestSnapshot = {
      summary: 'Goal\n- Latest.',
      firstKeptMessageIndex: 3,
      tokensBefore: 48000,
      createdAt: 180,
      source: 'auto-overflow' as const,
    };

    await persistence.createSession(session);
    await persistence.appendCompactionSnapshot(session.id, firstSnapshot);
    await persistence.appendCompactionSnapshot(session.id, latestSnapshot);

    const loaded = await persistence.loadSession(session.id);

    expect(loaded?.compactionSnapshot).toEqual(latestSnapshot);
  });

  it('skips malformed lines and messages with unsupported roles', async () => {
    const persistence = new Persistence(tempDir);
    const sessionId = 'broken-session';
    const filePath = persistence.getPath(sessionId);
    const validMessage = createUserMessage('kept', { timestamp: 120 });

    const content = [
      JSON.stringify({
        type: 'session_meta',
        id: sessionId,
        title: 'Broken',
        workspace: '/workspace',
        approvalMode: 'ask',
        createdAt: 100,
        ts: 100,
      }),
      '{invalid-json',
      JSON.stringify({
        type: 'message',
        message: { role: 'system', content: 'skip me', timestamp: 110 },
        ts: 110,
      }),
      JSON.stringify({ type: 'message', message: validMessage, ts: 120 }),
    ].join('\n') + '\n';

    await writeFile(filePath, content, 'utf-8');

    const loaded = await persistence.loadSession(sessionId);

    expect(loaded?.messages).toEqual([validMessage]);
    expect(loaded?.session.updatedAt).toBe(120);
  });

  it('loads and sorts all session metadata by latest update time', async () => {
    const persistence = new Persistence(tempDir);

    await writeFile(
      persistence.getPath('a'),
      [
        JSON.stringify({
          type: 'session_meta',
          id: 'a',
          title: 'A',
          workspace: '/a',
          approvalMode: 'ask',
          createdAt: 10,
          ts: 10,
        }),
        JSON.stringify({ type: 'meta_update', updates: { title: 'A2' }, ts: 40 }),
      ].join('\n') + '\n',
      'utf-8',
    );

    await writeFile(
      persistence.getPath('b'),
      [
        JSON.stringify({
          type: 'session_meta',
          id: 'b',
          title: 'B',
          workspace: '/b',
          approvalMode: 'ask',
          createdAt: 20,
          ts: 20,
        }),
        JSON.stringify({ type: 'message', message: createUserMessage('msg', { timestamp: 30 }), ts: 30 }),
      ].join('\n') + '\n',
      'utf-8',
    );

    const metas = await persistence.loadAllSessionMetas();

    expect(metas.map((session) => session.id)).toEqual(['a', 'b']);
    expect(metas[0]).toEqual({
      id: 'a',
      title: 'A2',
      workspace: '/a',
      approvalMode: 'ask',
      createdAt: 10,
      updatedAt: 40,
    });
  });
});
