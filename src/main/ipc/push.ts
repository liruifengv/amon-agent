import type { BrowserWindow } from 'electron';
import type { Session, AgentRunState, ToolExecutionState } from '@shared/types';
import type { Message } from '../../ai/types';
import type { PushEventMap } from '@shared/ipc-types';
import type { SessionStore } from '../store/session-store';

export class PushService {
  private window: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  push<K extends keyof PushEventMap>(channel: K, data: PushEventMap[K]): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data);
    }
  }

  pushMessagesUpdated(sessionId: string, messages: Message[]): void {
    this.push('push:messagesUpdated', { sessionId, messages });
  }

  pushAgentState(sessionId: string, state: AgentRunState): void {
    this.push('push:agentState', { sessionId, state });
  }

  pushToolExecution(sessionId: string, toolCallId: string, state: ToolExecutionState): void {
    this.push('push:toolExecution', { sessionId, toolCallId, state });
  }

  pushSessionCreated(session: Session): void {
    this.push('push:sessionCreated', session);
  }

  pushSessionDeleted(sessionId: string): void {
    this.push('push:sessionDeleted', { sessionId });
  }

  pushSessionUpdated(session: Session): void {
    this.push('push:sessionUpdated', session);
  }

  pushError(sessionId: string, error: string): void {
    this.push('push:error', { sessionId, error });
  }

  pushSettingsChanged(): void {
    this.push('push:settingsChanged', undefined as never);
  }

  pushSkillsChanged(): void {
    this.push('push:skillsChanged', undefined as never);
  }
}

/**
 * Bridge SessionStore events to PushService
 */
export function bridgeSessionStoreToPush(store: SessionStore, push: PushService): void {
  store.on('messages:updated', (sessionId: string, messages: Message[]) => {
    push.pushMessagesUpdated(sessionId, messages);
  });
  store.on('session:created', (session: Session) => {
    push.pushSessionCreated(session);
  });
  store.on('session:deleted', (sessionId: string) => {
    push.pushSessionDeleted(sessionId);
  });
  store.on('session:updated', (session: Session) => {
    push.pushSessionUpdated(session);
  });
}
