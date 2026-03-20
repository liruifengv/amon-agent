import type { CompactionNotice, Session, SessionMessage, AgentRunState, ToolExecutionState } from './types';
import type { PermissionRequest, PermissionResolved } from './permission-types';
import type { ConnectionAuthStatus } from './connection-auth';
import type { QuestionRequest, QuestionResolved } from './question-types';

// ==================== Push 事件类型映射（main -> renderer）====================

export interface PushEventMap {
  'push:messagesUpdated': { sessionId: string; messages: SessionMessage[] };
  'push:agentState': { sessionId: string; state: AgentRunState };
  'push:toolExecution': { sessionId: string; toolCallId: string; state: ToolExecutionState };
  'push:permissionRequested': PermissionRequest;
  'push:permissionResolved': PermissionResolved;
  'push:questionRequested': QuestionRequest;
  'push:questionResolved': QuestionResolved;
  'push:sessionCreated': Session;
  'push:sessionDeleted': { sessionId: string };
  'push:sessionUpdated': Session;
  'push:compaction': { sessionId: string; notice: CompactionNotice };
  'push:error': { sessionId: string; error: string };
  'push:settingsChanged': void;
  'push:skillsChanged': void;
  'push:connectionAuthChanged': { connectionId: string; status: ConnectionAuthStatus };
}
