import type { BrowserWindow } from 'electron';
import type { CompactionNotice, Session, SessionMessage, AgentRunState, ToolExecutionState } from '@shared/types';
import type { PermissionRequest, PermissionResolved } from '@shared/permission-types';
import type { QuestionRequest, QuestionResolved } from '@shared/question-types';
import type { PushEventMap } from '@shared/ipc-types';
import type { SessionStore } from '../store/session-store';
import type { ConnectionAuthStatus } from '@shared/connection-auth';

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

  pushMessagesUpdated(sessionId: string, messages: SessionMessage[]): void {
    this.push('push:messagesUpdated', { sessionId, messages });
  }

  pushAgentState(sessionId: string, state: AgentRunState): void {
    this.push('push:agentState', { sessionId, state });
  }

  pushToolExecution(sessionId: string, toolCallId: string, state: ToolExecutionState): void {
    this.push('push:toolExecution', { sessionId, toolCallId, state });
  }

  pushPermissionRequested(request: PermissionRequest): void {
    this.push('push:permissionRequested', request);
  }

  pushPermissionResolved(resolution: PermissionResolved): void {
    this.push('push:permissionResolved', resolution);
  }

  pushQuestionRequested(request: QuestionRequest): void {
    this.push('push:questionRequested', request);
  }

  pushQuestionResolved(resolution: QuestionResolved): void {
    this.push('push:questionResolved', resolution);
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

  pushCompaction(sessionId: string, notice: CompactionNotice): void {
    this.push('push:compaction', { sessionId, notice });
  }

  pushError(sessionId: string, error: string): void {
    this.push('push:error', { sessionId, error });
  }

  pushSettingsChanged(): void {
    this.push('push:settingsChanged', undefined as never);
  }

  pushConnectionAuthChanged(connectionId: string, status: ConnectionAuthStatus): void {
    this.push('push:connectionAuthChanged', { connectionId, status });
  }
}

/**
 * Bridge SessionStore events to PushService
 */
export function bridgeSessionStoreToPush(store: SessionStore, push: PushService): void {
  store.on('messages:updated', (sessionId: string, messages: SessionMessage[]) => {
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
