import type { Message, Session, AgentRunState, ToolExecutionState } from './types';
import type { PermissionRequest, PermissionResolved } from './permission-types';
import type { ProviderAuthStatus } from './provider-auth';

// ==================== Push 事件类型映射（main -> renderer）====================

export interface PushEventMap {
  'push:messagesUpdated': { sessionId: string; messages: Message[] };
  'push:agentState': { sessionId: string; state: AgentRunState };
  'push:toolExecution': { sessionId: string; toolCallId: string; state: ToolExecutionState };
  'push:permissionRequested': PermissionRequest;
  'push:permissionResolved': PermissionResolved;
  'push:sessionCreated': Session;
  'push:sessionDeleted': { sessionId: string };
  'push:sessionUpdated': Session;
  'push:error': { sessionId: string; error: string };
  'push:settingsChanged': void;
  'push:skillsChanged': void;
  'push:providerAuthChanged': { providerConfigId: string; status: ProviderAuthStatus };
}
