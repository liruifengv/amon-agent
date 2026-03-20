import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { STREAM_THROTTLE_MS } from '@shared/constants';
import { SessionStore } from '@/main/store/session-store';
import { createUserMessage } from '../../_helpers/mock-messages';

function createSession(id: string, updatedAt: number) {
  return {
    id,
    title: `Session ${id}`,
    workspace: `/workspace/${id}`,
    approvalMode: 'ask' as const,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('SessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sorts sessions by descending updatedAt', () => {
    const store = new SessionStore();
    store.createSession(createSession('older', 10));
    store.createSession(createSession('newer', 20));

    expect(store.getAllSessions().map((session) => session.id)).toEqual(['newer', 'older']);
  });

  it('adds messages immediately and bumps the session updatedAt timestamp', () => {
    const store = new SessionStore();
    const session = createSession('s1', 100);
    const listener = vi.fn();
    store.on('messages:updated', listener);
    store.createSession(session);

    vi.spyOn(Date, 'now').mockReturnValue(200);
    const message = createUserMessage('hello', { timestamp: 150 });
    store.addMessage('s1', message);

    expect(store.getMessages('s1')).toEqual([message]);
    expect(store.getSession('s1')?.updatedAt).toBe(200);
    expect(listener).toHaveBeenCalledWith('s1', [message]);
  });

  it('throttles updateMessageAt and emits only the latest message snapshot', async () => {
    const store = new SessionStore();
    store.createSession(createSession('s1', 100));
    store.addMessage('s1', createUserMessage('initial', { timestamp: 100 }));

    const listener = vi.fn();
    store.on('messages:updated', listener);

    const firstUpdate = createUserMessage('first update', { timestamp: 101 });
    const finalUpdate = createUserMessage('final update', { timestamp: 102 });

    store.updateMessageAt('s1', 0, firstUpdate);
    store.updateMessageAt('s1', 0, finalUpdate);

    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(STREAM_THROTTLE_MS);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('s1', [finalUpdate]);
    expect(store.getMessages('s1')).toEqual([finalUpdate]);
  });

  it('loads session state in bulk', () => {
    const store = new SessionStore();
    const session = createSession('loaded', 50);
    const messages = [createUserMessage('persisted', { timestamp: 60 })];
    const compactionSnapshot = {
      summary: 'Goal\n- Keep going.',
      firstKeptMessageIndex: 1,
      tokensBefore: 35000,
      createdAt: 70,
      source: 'auto-threshold' as const,
    };

    store.loadSessionState({ session, messages, compactionSnapshot });

    expect(store.getSession('loaded')).toEqual(session);
    expect(store.getMessages('loaded')).toEqual(messages);
    expect(store.getCompactionSnapshot('loaded')).toEqual(compactionSnapshot);
  });

  it('stores compaction snapshots separately from visible messages', () => {
    const store = new SessionStore();
    store.createSession(createSession('s1', 100));

    const snapshot = {
      summary: 'Goal\n- Compact.',
      firstKeptMessageIndex: 2,
      tokensBefore: 50000,
      createdAt: 200,
      source: 'auto-overflow' as const,
    };

    store.setCompactionSnapshot('s1', snapshot);

    expect(store.getMessages('s1')).toEqual([]);
    expect(store.getCompactionSnapshot('s1')).toEqual(snapshot);
  });
});
