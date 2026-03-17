import type { AgentEvent, AgentMessage } from '../../agent';
import { isPermissionToolUpdate } from '@shared/permission-types';
import type { SessionStore } from '../store/session-store';
import type { PushService } from '../ipc/push';

/**
 * Bridges AgentEvent to SessionStore + PushService.
 * Uses array index tracking (not message IDs) for streaming updates.
 */
export class EventAdapter {
  // Track the index of the currently streaming message per session
  private streamingIndex = new Map<string, number>();

  constructor(
    private sessionStore: SessionStore,
    private pushService: PushService,
  ) {}

	handleEvent(sessionId: string, event: AgentEvent): void {
		switch (event.type) {
      case 'message_start': {
        // Add message to SessionStore, track its index
        this.sessionStore.addMessage(sessionId, event.message as any);
        const msgs = this.sessionStore.getMessages(sessionId);
        this.streamingIndex.set(sessionId, msgs.length - 1);
        break;
      }

      case 'message_update': {
        // Update message in-place via index
        const updateIdx = this.streamingIndex.get(sessionId);
        if (updateIdx !== undefined) {
          this.sessionStore.updateMessageAt(sessionId, updateIdx, event.message as any);
        }
        break;
      }

      case 'message_end': {
        // Final update for the message
        const endIdx = this.streamingIndex.get(sessionId);
        if (endIdx !== undefined) {
          this.sessionStore.updateMessageAt(sessionId, endIdx, event.message as any);
        }
        this.streamingIndex.delete(sessionId);
        break;
      }

      case 'tool_execution_start':
        this.pushService.pushToolExecution(sessionId, event.toolCallId, {
          toolName: event.toolName,
          status: 'running',
        });
        break;

      case 'tool_execution_update':
        {
          const permissionUpdate = getPermissionUpdateDetails(event.partialResult);
          if (permissionUpdate) {

            if (permissionUpdate.type === 'permission_request') {
              this.pushService.pushPermissionRequested(permissionUpdate.request);
              this.pushService.pushToolExecution(sessionId, event.toolCallId, {
                toolName: event.toolName,
                status: 'awaiting_approval',
              });
              break;
            }

            this.pushService.pushPermissionResolved({
              requestId: permissionUpdate.requestId,
              sessionId,
              toolCallId: event.toolCallId,
              decision: permissionUpdate.decision,
            });
            this.pushService.pushToolExecution(sessionId, event.toolCallId, {
              toolName: event.toolName,
              status: permissionUpdate.decision === 'approve' ? 'running' : 'error',
              isError: permissionUpdate.decision === 'reject',
            });
            break;
          }
        }

        this.pushService.pushToolExecution(sessionId, event.toolCallId, {
          toolName: event.toolName,
          status: 'running',
          partialResult: typeof event.partialResult === 'string'
            ? event.partialResult
            : JSON.stringify(event.partialResult),
        });
        break;

      case 'tool_execution_end':
        this.pushService.pushToolExecution(sessionId, event.toolCallId, {
          toolName: event.toolName,
          status: event.isError ? 'error' : 'completed',
          isError: event.isError,
        });
        break;

		case 'turn_end':
			pushAssistantError(this.pushService, sessionId, event.message);
			break;

		case 'agent_end':
			this.streamingIndex.delete(sessionId);
			break;

		// agent_start and turn_start are informational
		}
	}
}

function pushAssistantError(pushService: PushService, sessionId: string, message: AgentMessage): void {
	if (message.role !== 'assistant' || !message.errorMessage) {
		return;
	}
	pushService.pushError(sessionId, message.errorMessage);
}

function getPermissionUpdateDetails(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const details = (value as { details?: unknown }).details;
  return isPermissionToolUpdate(details) ? details : null;
}
