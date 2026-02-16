import type { Message, Session, StreamingState, ToolCallState } from './types';

// ==================== Push 事件类型映射（main -> renderer）====================

export interface PushEventMap {
  'push:messagesUpdated': { sessionId: string; messages: Message[] };
  'push:streamingState': { sessionId: string; state: StreamingState };
  'push:toolCallState': { sessionId: string; toolCallId: string; state: ToolCallState };
  'push:sessionCreated': Session;
  'push:sessionDeleted': { sessionId: string };
  'push:sessionUpdated': Session;
  'push:error': { sessionId: string; error: string };
  'push:settingsChanged': void;
}
