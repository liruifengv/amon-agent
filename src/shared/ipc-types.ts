import type { Message, Session, AgentRunState, ToolExecutionState } from './types';

// ==================== Push 事件类型映射（main -> renderer）====================

export interface PushEventMap {
  'push:messagesUpdated': { sessionId: string; messages: Message[] };
  'push:agentState': { sessionId: string; state: AgentRunState };
  'push:toolExecution': { sessionId: string; toolCallId: string; state: ToolExecutionState };
  'push:sessionCreated': Session;
  'push:sessionDeleted': { sessionId: string };
  'push:sessionUpdated': Session;
  'push:error': { sessionId: string; error: string };
  'push:settingsChanged': void;
  'push:skillsChanged': void;
}
