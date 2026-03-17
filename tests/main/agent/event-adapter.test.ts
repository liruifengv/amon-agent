import { describe, expect, it, vi } from 'vitest';
import { EventAdapter } from '@/main/agent/event-adapter';
import { PushService, bridgeSessionStoreToPush } from '@/main/ipc/push';
import { SessionStore } from '@/main/store/session-store';
import { createAssistantMessage, createUserMessage } from '../../_helpers/mock-messages';

function createSessionStoreWithSession(): SessionStore {
  const store = new SessionStore();
  store.createSession({
    id: 's1',
    title: 'Session 1',
    workspace: '/workspace',
    approvalMode: 'ask',
    createdAt: 100,
    updatedAt: 100,
  });
  return store;
}

describe('EventAdapter', () => {
  it('streams message updates into the same session store slot', () => {
    const store = createSessionStoreWithSession();
    const pushService = {
      pushToolExecution: vi.fn(),
    } as unknown as PushService;

    const adapter = new EventAdapter(store, pushService);
    const started = createAssistantMessage([{ type: 'text', text: 'hel' }], { timestamp: 110 });
    const updated = createAssistantMessage([{ type: 'text', text: 'hello' }], { timestamp: 111 });
    const ended = createAssistantMessage([{ type: 'text', text: 'hello world' }], { timestamp: 112 });

    adapter.handleEvent('s1', { type: 'message_start', message: started });
    adapter.handleEvent('s1', {
      type: 'message_update',
      message: updated,
      assistantMessageEvent: {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'lo',
        partial: updated,
      },
    });
    adapter.handleEvent('s1', { type: 'message_end', message: ended });

    expect(store.getMessages('s1')).toEqual([ended]);
  });

  it('maps tool execution events to push state updates', () => {
    const store = createSessionStoreWithSession();
    const pushToolExecution = vi.fn();
    const adapter = new EventAdapter(store, { pushToolExecution } as unknown as PushService);

    adapter.handleEvent('s1', {
      type: 'tool_execution_start',
      toolCallId: 'tc-1',
      toolName: 'Read',
      args: {},
    });
    adapter.handleEvent('s1', {
      type: 'tool_execution_update',
      toolCallId: 'tc-1',
      toolName: 'Read',
      args: {},
      partialResult: { chunk: 'abc' },
    });
    adapter.handleEvent('s1', {
      type: 'tool_execution_end',
      toolCallId: 'tc-1',
      toolName: 'Read',
      result: {},
      isError: true,
    });

    expect(pushToolExecution).toHaveBeenNthCalledWith(1, 's1', 'tc-1', {
      toolName: 'Read',
      status: 'running',
    });
    expect(pushToolExecution).toHaveBeenNthCalledWith(2, 's1', 'tc-1', {
      toolName: 'Read',
      status: 'running',
      partialResult: '{"chunk":"abc"}',
    });
    expect(pushToolExecution).toHaveBeenNthCalledWith(3, 's1', 'tc-1', {
      toolName: 'Read',
      status: 'error',
      isError: true,
    });
  });

  it('clears streaming state on agent end so later updates are ignored', () => {
    const store = createSessionStoreWithSession();
    const adapter = new EventAdapter(store, { pushToolExecution: vi.fn() } as unknown as PushService);
    const initial = createAssistantMessage([{ type: 'text', text: 'first' }], { timestamp: 110 });
    const ignored = createAssistantMessage([{ type: 'text', text: 'ignored' }], { timestamp: 111 });

    adapter.handleEvent('s1', { type: 'message_start', message: initial });
    adapter.handleEvent('s1', { type: 'agent_end', messages: [] });
    adapter.handleEvent('s1', {
      type: 'message_update',
      message: ignored,
      assistantMessageEvent: {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'x',
        partial: ignored,
      },
    });

    expect(store.getMessages('s1')).toEqual([initial]);
  });

  it('pushes assistant turn errors to the renderer error channel', () => {
    const store = createSessionStoreWithSession();
    const pushError = vi.fn();
    const adapter = new EventAdapter(store, {
      pushToolExecution: vi.fn(),
      pushError,
    } as unknown as PushService);
    const failed = createAssistantMessage([{ type: 'text', text: '' }], {
      stopReason: 'error',
      errorMessage: 'Instructions are required',
    });

    adapter.handleEvent('s1', {
      type: 'turn_end',
      message: failed,
      toolResults: [],
    });

    expect(pushError).toHaveBeenCalledWith('s1', 'Instructions are required');
  });
});

describe('PushService', () => {
  it('does not send events when no window is set or the window is destroyed', () => {
    const push = new PushService();
    push.push('push:skillsChanged', undefined as never);

    const send = vi.fn();
    push.setWindow({
      isDestroyed: vi.fn(() => true),
      webContents: { send },
    } as any);
    push.pushSettingsChanged();

    expect(send).not.toHaveBeenCalled();
  });

  it('bridges session store events to renderer push events', () => {
    const store = new SessionStore();
    const push = new PushService();
    const send = vi.fn();
    push.setWindow({
      isDestroyed: vi.fn(() => false),
      webContents: { send },
    } as any);

    bridgeSessionStoreToPush(store, push);

    const session = {
      id: 's1',
      title: 'Session 1',
      workspace: '/workspace',
      approvalMode: 'ask' as const,
      createdAt: 100,
      updatedAt: 100,
    };
    const message = createUserMessage('hello', { timestamp: 110 });

    store.createSession(session);
    store.addMessage('s1', message);
    store.renameSession('s1', 'Renamed');
    store.deleteSession('s1');

    expect(send).toHaveBeenCalledWith('push:sessionCreated', session);
    expect(send).toHaveBeenCalledWith('push:messagesUpdated', {
      sessionId: 's1',
      messages: [message],
    });
    expect(send).toHaveBeenCalledWith('push:sessionUpdated', expect.objectContaining({
      id: 's1',
      title: 'Renamed',
    }));
    expect(send).toHaveBeenCalledWith('push:sessionDeleted', { sessionId: 's1' });
  });
});
