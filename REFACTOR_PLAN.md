# 消息处理系统重构计划

## 一、背景与目标

### 当前问题

| 问题 | 当前实现 | 影响 |
|------|----------|------|
| 缺少流式状态管理 | 无状态机，依赖长度比较补全 | 多 block 场景容易出错 |
| 未处理 `content_block_start/stop` | 仅处理 delta | UI 不知道 block 边界 |
| 未处理 `input_json_delta` | 忽略 | 大型工具输入无法渐进显示 |
| 文本/思考块无唯一 ID | 按类型追加到最后一个同类 block | 多个同类型 block 会被错误合并 |
| 未处理 `parent_tool_use_id` | 忽略 | Subagent 工具调用无层级显示 |
| 未处理 `message_start/stop` | 忽略 | 无法精确控制消息生命周期 |

### 重构目标

1. **完整的流式事件处理**：支持所有 stream_event 类型
2. **精确的 Block 状态管理**：每个 block 有唯一 ID，独立追踪生命周期
3. **Subagent 工具层级**：支持 `parent_tool_use_id`，实现嵌套工具调用显示
4. **更健壮的补全逻辑**：基于 block ID 而非长度比较

---

## 二、SDK 消息类型分析

### 消息类型概览

```typescript
SDKMessage =
  | SDKAssistantMessage      // 完整的 assistant 消息
  | SDKUserMessage           // user 消息（含 tool_result）
  | SDKPartialAssistantMessage  // stream_event
  | SDKResultMessage         // 查询完成
  | SDKSystemMessage         // 系统消息（init, compact_boundary, status）
  | SDKToolProgressMessage   // 工具执行进度
  | SDKAuthStatusMessage     // 认证状态
```

### stream_event 生命周期

```
1. message_start       → 创建新 step，初始化状态
2. content_block_start → 创建 block（text/thinking/tool_use）
3. content_block_delta → 追加增量（text_delta/thinking_delta/input_json_delta）
4. content_block_stop  → 标记 block 完成
5. message_delta       → 暂存 usage/stop_reason
6. message_stop        → 完成当前 step，重置状态
```

### parent_tool_use_id 机制

- 存在于 `SDKUserMessage`、`SDKAssistantMessage`、`SDKPartialAssistantMessage`、`SDKToolProgressMessage`
- `null` 表示顶层（主 Agent）
- 非 `null` 表示属于某个 Subagent（值为父 Task 工具的 tool_use_id）

---

## 三、数据结构设计

### 3.1 扩展 MessageContentBlock

```typescript
// src/shared/types.ts

// 内容块基础字段
interface ContentBlockBase {
  id: string;           // 唯一标识（新增）
  isComplete?: boolean; // 是否已完成流式传输（新增）
}

// 文本块
interface TextContentBlock extends ContentBlockBase {
  type: 'text';
  content: string;
}

// 思考块
interface ThinkingContentBlock extends ContentBlockBase {
  type: 'thinking';
  content: string;
}

// 工具调用块（扩展）
interface ToolCallContentBlock {
  type: 'tool_call';
  toolCall: ToolCall;
}

// 工具调用（扩展）
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  inputBuffer?: string;     // 流式输入缓冲（新增）
  output?: string;
  status: ToolCallStatus;
  isError?: boolean;
  parentToolUseId?: string | null;  // 父工具 ID（新增）
  childToolCalls?: string[];        // 子工具 ID 列表（新增）
}

export type MessageContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolCallContentBlock
  | { type: 'permission'; permission: PermissionRecord }
  | { type: 'user_question'; userQuestion: UserQuestionRecord }
  | { type: 'plan_approval'; planApproval: PlanApprovalRecord };
```

### 3.2 扩展 StreamEvent 类型

```typescript
// src/shared/types.ts

export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop';

export interface StreamEvent {
  type: StreamEventType;
  index?: number;

  // content_block_start
  content_block?: {
    type: 'text' | 'thinking' | 'tool_use';
    id?: string;      // tool_use 时有
    name?: string;    // tool_use 时有
    text?: string;    // text 时可能有初始内容
  };

  // content_block_delta
  delta?: {
    type: 'text_delta' | 'thinking_delta' | 'input_json_delta';
    text?: string;
    thinking?: string;
    partial_json?: string;
  };

  // message_delta
  usage?: {
    output_tokens: number;
  };
  stop_reason?: string;
}
```

### 3.3 StreamState 状态类

```typescript
// src/main/agent/streamState.ts

interface BlockState {
  id: string;
  index: number;
  kind: 'text' | 'thinking' | 'tool';
  content: string;  // 累积内容
  // tool 专用
  toolCallId?: string;
  toolName?: string;
  inputBuffer?: string;
}

export class StreamState {
  private blocksByIndex: Map<number, BlockState> = new Map();
  private pendingUsage?: { outputTokens: number };
  private pendingStopReason?: string;
  private stepActive: boolean = false;

  // 状态管理
  beginStep(): void;
  hasActiveStep(): boolean;
  resetStep(): void;

  // Block 操作
  openTextBlock(index: number, id: string): BlockState;
  openThinkingBlock(index: number, id: string): BlockState;
  openToolBlock(index: number, params: { id: string; toolCallId: string; toolName: string }): BlockState;

  appendDelta(index: number, content: string): BlockState | undefined;
  appendToolInputDelta(index: number, jsonDelta: string): BlockState | undefined;

  closeBlock(index: number): BlockState | undefined;
  getBlock(index: number): BlockState | undefined;

  // Usage
  setPendingUsage(outputTokens: number, stopReason?: string): void;
  getPendingUsage(): { outputTokens?: number; stopReason?: string };
}
```

---

## 四、消息处理重构

### 4.1 MessageHandler 重构

```typescript
// src/main/agent/messageHandler.ts

export interface MessageContext {
  sessionId: string;
  messageId: string;
  streamState: StreamState;  // 新增：流式状态
}

// 主入口
export function handleMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  // 提取 parent_tool_use_id
  const parentToolUseId = extractParentToolUseId(sdkMessage);

  switch (sdkMessage.type) {
    case 'assistant':
      return handleAssistantMessage(sdkMessage, ctx, parentToolUseId);
    case 'user':
      return handleUserMessage(sdkMessage, ctx, parentToolUseId);
    case 'stream_event':
      return handleStreamEvent(sdkMessage, ctx, parentToolUseId);
    case 'result':
      return handleResultMessage(sdkMessage, ctx);
    case 'system':
      return handleSystemMessage(sdkMessage, ctx);
    case 'tool_progress':
      return handleToolProgressMessage(sdkMessage, ctx);
    default:
      return { type: 'continue' };
  }
}
```

### 4.2 handleStreamEvent 重构

```typescript
function handleStreamEvent(
  sdkMessage: SDKMessage,
  ctx: MessageContext,
  parentToolUseId: string | null
): HandleResult {
  const { sessionId, messageId, streamState } = ctx;
  const event = sdkMessage.event;
  if (!event) return { type: 'continue' };

  switch (event.type) {
    case 'message_start':
      streamState.beginStep();
      break;

    case 'content_block_start':
      handleContentBlockStart(event, ctx, parentToolUseId);
      break;

    case 'content_block_delta':
      handleContentBlockDelta(event, ctx);
      break;

    case 'content_block_stop':
      handleContentBlockStop(event, ctx);
      break;

    case 'message_delta':
      if (event.usage?.output_tokens !== undefined) {
        streamState.setPendingUsage(event.usage.output_tokens, event.stop_reason);
      }
      break;

    case 'message_stop':
      streamState.resetStep();
      break;
  }

  return { type: 'continue' };
}

function handleContentBlockStart(
  event: StreamEvent,
  ctx: MessageContext,
  parentToolUseId: string | null
): void {
  const { sessionId, messageId, streamState } = ctx;
  const { index, content_block } = event;
  if (index === undefined || !content_block) return;

  const blockId = generateBlockId();

  switch (content_block.type) {
    case 'text':
      streamState.openTextBlock(index, blockId);
      sessionStore.addContentBlock(sessionId, messageId, {
        type: 'text',
        id: blockId,
        content: content_block.text || '',
        isComplete: false,
      });
      break;

    case 'thinking':
      streamState.openThinkingBlock(index, blockId);
      sessionStore.addContentBlock(sessionId, messageId, {
        type: 'thinking',
        id: blockId,
        content: '',
        isComplete: false,
      });
      break;

    case 'tool_use':
      streamState.openToolBlock(index, {
        id: blockId,
        toolCallId: content_block.id!,
        toolName: content_block.name!,
      });
      sessionStore.addToolCallToMessage(sessionId, messageId, {
        id: content_block.id!,
        name: content_block.name!,
        input: {},
        inputBuffer: '',
        status: 'pending',
        parentToolUseId,
      });
      break;
  }
}

function handleContentBlockDelta(event: StreamEvent, ctx: MessageContext): void {
  const { sessionId, messageId, streamState } = ctx;
  const { index, delta } = event;
  if (index === undefined || !delta) return;

  switch (delta.type) {
    case 'text_delta':
      if (delta.text) {
        const block = streamState.appendDelta(index, delta.text);
        if (block) {
          sessionStore.updateContentBlock(sessionId, messageId, block.id, {
            content: block.content,
          });
        }
      }
      break;

    case 'thinking_delta':
      if (delta.thinking) {
        const block = streamState.appendDelta(index, delta.thinking);
        if (block) {
          sessionStore.updateContentBlock(sessionId, messageId, block.id, {
            content: block.content,
          });
        }
      }
      break;

    case 'input_json_delta':
      if (delta.partial_json) {
        const block = streamState.appendToolInputDelta(index, delta.partial_json);
        if (block && block.toolCallId) {
          sessionStore.updateToolCallInputBuffer(
            sessionId,
            block.toolCallId,
            block.inputBuffer!
          );
        }
      }
      break;
  }
}

function handleContentBlockStop(event: StreamEvent, ctx: MessageContext): void {
  const { sessionId, messageId, streamState } = ctx;
  const { index } = event;
  if (index === undefined) return;

  const block = streamState.closeBlock(index);
  if (!block) return;

  switch (block.kind) {
    case 'text':
    case 'thinking':
      sessionStore.updateContentBlock(sessionId, messageId, block.id, {
        isComplete: true,
      });
      break;

    case 'tool':
      // 解析累积的 JSON 输入
      if (block.inputBuffer && block.toolCallId) {
        try {
          const input = JSON.parse(block.inputBuffer);
          sessionStore.updateToolCallInput(sessionId, block.toolCallId, input);
        } catch (e) {
          log.warn('Failed to parse tool input JSON', { toolCallId: block.toolCallId });
        }
      }
      break;
  }
}
```

### 4.3 handleAssistantMessage 简化

```typescript
function handleAssistantMessage(
  sdkMessage: SDKMessage,
  ctx: MessageContext,
  parentToolUseId: string | null
): HandleResult {
  const { sessionId, messageId, streamState } = ctx;

  // 如果有活跃的流式 step，说明已经通过 stream_event 处理过
  // assistant 消息仅用于补全和工具调用
  if (!sdkMessage.message?.content) {
    return { type: 'continue' };
  }

  const content = sdkMessage.message.content as ContentBlock[];

  for (const block of content) {
    if (block.type === 'tool_use') {
      // 确保工具调用存在（可能已通过 content_block_start 添加）
      const existingTool = sessionStore.findToolCall(sessionId, block.id);
      if (!existingTool) {
        sessionStore.addToolCallToMessage(sessionId, messageId, {
          id: block.id,
          name: block.name,
          input: block.input,
          status: 'running',
          parentToolUseId,
        });
      } else {
        // 更新状态和完整输入
        sessionStore.updateToolCall(sessionId, block.id, {
          input: block.input,
          status: 'running',
        });
      }
    }
    // text 和 thinking 已通过 stream_event 处理，这里不再重复
  }

  return { type: 'continue' };
}
```

---

## 五、SessionStore 扩展

### 5.1 新增方法

```typescript
// src/main/store/sessionStore.ts

class SessionStore extends EventEmitter {
  // ... 现有方法 ...

  /**
   * 添加内容块（带 ID）
   */
  addContentBlock(
    sessionId: string,
    messageId: string,
    block: MessageContentBlock
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message) return;

    const blocks = message.contentBlocks || [];
    blocks.push(block);
    message.contentBlocks = blocks;

    this.markDirty(sessionId);
    this.throttledEmit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新指定 ID 的内容块
   */
  updateContentBlock(
    sessionId: string,
    messageId: string,
    blockId: string,
    updates: Partial<{ content: string; isComplete: boolean }>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message?.contentBlocks) return;

    const block = message.contentBlocks.find(
      b => (b.type === 'text' || b.type === 'thinking') && b.id === blockId
    );
    if (!block || (block.type !== 'text' && block.type !== 'thinking')) return;

    if (updates.content !== undefined) {
      block.content = updates.content;
    }
    if (updates.isComplete !== undefined) {
      block.isComplete = updates.isComplete;
    }

    this.markDirty(sessionId);
    this.throttledEmit('messages:updated', sessionId, session.messages);
  }

  /**
   * 查找工具调用
   */
  findToolCall(sessionId: string, toolId: string): ToolCall | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    for (const message of session.messages) {
      if (!message.contentBlocks) continue;
      for (const block of message.contentBlocks) {
        if (block.type === 'tool_call' && block.toolCall.id === toolId) {
          return block.toolCall;
        }
      }
    }
    return undefined;
  }

  /**
   * 更新工具调用的输入缓冲
   */
  updateToolCallInputBuffer(
    sessionId: string,
    toolId: string,
    inputBuffer: string
  ): void {
    // ... 实现 ...
  }

  /**
   * 更新工具调用的完整输入
   */
  updateToolCallInput(
    sessionId: string,
    toolId: string,
    input: Record<string, unknown>
  ): void {
    // ... 实现 ...
  }

  /**
   * 获取工具的子工具调用
   */
  getChildToolCalls(sessionId: string, parentToolId: string): ToolCall[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const children: ToolCall[] = [];
    for (const message of session.messages) {
      if (!message.contentBlocks) continue;
      for (const block of message.contentBlocks) {
        if (
          block.type === 'tool_call' &&
          block.toolCall.parentToolUseId === parentToolId
        ) {
          children.push(block.toolCall);
        }
      }
    }
    return children;
  }
}
```

---

## 六、UI 组件更新

### 6.1 Subagent 工具层级显示

#### 数据结构

```typescript
// 工具调用树节点
interface ToolCallNode {
  toolCall: ToolCall;
  children: ToolCallNode[];
}

// 构建工具调用树
function buildToolCallTree(toolCalls: ToolCall[]): ToolCallNode[] {
  const nodeMap = new Map<string, ToolCallNode>();
  const roots: ToolCallNode[] = [];

  // 创建所有节点
  for (const tc of toolCalls) {
    nodeMap.set(tc.id, { toolCall: tc, children: [] });
  }

  // 建立父子关系
  for (const tc of toolCalls) {
    const node = nodeMap.get(tc.id)!;
    if (tc.parentToolUseId && nodeMap.has(tc.parentToolUseId)) {
      nodeMap.get(tc.parentToolUseId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
```

#### SubagentToolGroup 组件

```tsx
// src/renderer/components/Message/SubagentToolGroup.tsx

interface SubagentToolGroupProps {
  parentTool: ToolCall;        // Task 工具调用
  childTools: ToolCall[];      // 子工具调用
  defaultCollapsed?: boolean;
}

const SubagentToolGroup: React.FC<SubagentToolGroupProps> = ({
  parentTool,
  childTools,
  defaultCollapsed = true,  // Subagent 默认折叠
}) => {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  return (
    <div className="border-l-2 border-primary/30 pl-3 my-2">
      {/* Subagent 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
        <Bot className="w-4 h-4" />
        <span>Subagent: {parentTool.input.description || parentTool.input.subagent_type}</span>
        <span className="text-xs">({childTools.length} tools)</span>
      </button>

      {/* 子工具列表 */}
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {childTools.map(tool => (
            <ToolCallBlock key={tool.id} toolCall={tool} />
          ))}
        </div>
      )}
    </div>
  );
};
```

#### AssistantMessage 更新

```tsx
// 修改 groupContentBlocks 函数

function groupContentBlocks(blocks: MessageContentBlock[]): GroupedBlock[] {
  const groups: GroupedBlock[] = [];

  // 提取所有工具调用
  const allToolCalls = blocks
    .filter(b => b.type === 'tool_call')
    .map(b => b.toolCall);

  // 构建工具树
  const toolTree = buildToolCallTree(allToolCalls);

  // 遍历 blocks，处理分组逻辑
  // Task 工具（有子工具）作为 SubagentGroup
  // 其他工具按现有逻辑分组
  // ...
}
```

### 6.2 ToolCallBlock 增强

```tsx
// src/renderer/components/Message/ContentBlocks/ToolCallBlock.tsx

interface ToolCallBlockProps {
  toolCall: ToolCall;
  isNested?: boolean;  // 是否为嵌套显示（Subagent 内）
}

const ToolCallBlock: React.FC<ToolCallBlockProps> = ({
  toolCall,
  isNested = false
}) => {
  // 如果是 Task 工具且有子工具，显示为 SubagentGroup
  // 否则显示为普通工具块

  // 流式输入显示
  const displayInput = useMemo(() => {
    if (toolCall.input && Object.keys(toolCall.input).length > 0) {
      return toolCall.input;
    }
    // 如果完整输入不可用，显示流式缓冲
    if (toolCall.inputBuffer) {
      try {
        return JSON.parse(toolCall.inputBuffer);
      } catch {
        return { _streaming: toolCall.inputBuffer };
      }
    }
    return {};
  }, [toolCall.input, toolCall.inputBuffer]);

  // ... 现有渲染逻辑 ...
};
```

---

## 七、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/shared/types.ts` | 修改 | 扩展类型定义 |
| `src/main/agent/streamState.ts` | **新增** | 流式状态管理类 |
| `src/main/agent/messageHandler.ts` | 重构 | 完整 stream_event 处理 |
| `src/main/agent/agentService.ts` | 修改 | 集成 StreamState |
| `src/main/store/sessionStore.ts` | 修改 | 新增 block 级别操作 |
| `src/renderer/components/Message/AssistantMessage.tsx` | 修改 | 支持工具树分组 |
| `src/renderer/components/Message/SubagentToolGroup.tsx` | **新增** | Subagent 工具组组件 |
| `src/renderer/components/Message/ContentBlocks/ToolCallBlock.tsx` | 修改 | 支持嵌套和流式输入 |

---

## 八、实现阶段

### Phase 1: 类型与基础设施

1. 扩展 `src/shared/types.ts`
   - MessageContentBlock 添加 id, isComplete
   - ToolCall 添加 parentToolUseId, inputBuffer
   - StreamEvent 扩展完整类型

2. 创建 `src/main/agent/streamState.ts`
   - 实现 StreamState 类
   - 完整的 block 生命周期管理

### Phase 2: 消息处理重构

3. 重构 `src/main/agent/messageHandler.ts`
   - 添加 parent_tool_use_id 提取
   - 完整处理所有 stream_event 类型
   - 简化 assistant 消息处理

4. 更新 `src/main/agent/agentService.ts`
   - 创建和传递 StreamState 实例
   - 确保每个查询有独立的状态

### Phase 3: SessionStore 扩展

5. 扩展 `src/main/store/sessionStore.ts`
   - addContentBlock
   - updateContentBlock
   - findToolCall
   - updateToolCallInputBuffer
   - getChildToolCalls

### Phase 4: UI 组件更新

6. 创建 `SubagentToolGroup.tsx`
   - Subagent 工具组组件
   - 默认折叠，可展开

7. 更新 `AssistantMessage.tsx`
   - 构建工具调用树
   - 区分 Subagent 和普通工具组

8. 更新 `ToolCallBlock.tsx`
   - 支持流式输入显示
   - 支持嵌套样式

### Phase 5: 测试与优化

9. 测试场景
   - 单个文本块流式
   - 多个文本块（不同 index）
   - 思考 + 文本混合
   - 工具调用流式输入
   - Subagent 嵌套工具
   - 非流式兜底（直接 assistant 消息）

10. 性能优化
    - 确保节流正常工作
    - 避免不必要的重渲染

---

## 九、兼容性考虑

### 向后兼容

- 旧的消息数据（无 block.id）仍可正常显示
- 添加迁移逻辑：加载时为旧 block 生成 ID

### 数据迁移

```typescript
// 加载会话时的迁移
function migrateSession(session: Session): Session {
  for (const message of session.messages) {
    if (message.contentBlocks) {
      for (const block of message.contentBlocks) {
        if ((block.type === 'text' || block.type === 'thinking') && !block.id) {
          block.id = generateBlockId();
          block.isComplete = true; // 旧数据视为已完成
        }
      }
    }
  }
  return session;
}
```

---

## 十、预期效果

### 流式显示改进

- 精确的 block 边界，不会错误合并
- 工具输入渐进显示
- 更准确的完成状态

### Subagent 层级显示

```
┌─ Read File: src/main/index.ts ✓
├─ Bash: npm run build ✓
└─ Task: Explore codebase
   │ ┌─ Glob: **/*.ts ✓
   │ ├─ Grep: "export function" ✓
   │ └─ Read File: src/utils/helper.ts ✓
```

- 清晰的父子层级
- 默认折叠，减少视觉干扰
- 可展开查看详情
