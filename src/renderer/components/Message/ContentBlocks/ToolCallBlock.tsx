import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolCall, ToolResultMessage } from '../../../types';
import { useChatStore } from '../../../store/chatStore';
import {
  FileText,
  Pencil,
  Edit,
  Terminal,
  Search,
  SearchCode,
  Globe,
  Settings,
  ListTodo,
  ChevronRight,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { CodeBlockContent } from '../../ai-elements/code-block';
import type { BundledLanguage } from 'shiki';
import * as Diff from 'diff';
import { useSessionStore } from '../../../store/sessionStore';

// 文件扩展名到语言的映射
const EXT_TO_LANG: Record<string, BundledLanguage> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  // Programming languages
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  r: 'r',
  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  // Config
  md: 'markdown',
  mdx: 'mdx',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmake: 'cmake',
  // Other
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  env: 'dotenv',
};

/**
 * 从文件路径获取语言类型
 */
function getLanguageFromPath(filePath: string): BundledLanguage {
  const fileName = filePath.split('/').pop() || '';
  const lowerFileName = fileName.toLowerCase();

  // 特殊文件名
  if (lowerFileName === 'dockerfile') return 'dockerfile';
  if (lowerFileName === 'makefile') return 'makefile';
  if (lowerFileName.startsWith('.env')) return 'dotenv';

  // 获取扩展名
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || 'text';
}

/**
 * 截断文件路径，如果是工作空间内的文件则显示相对路径
 */
function truncateFilePath(filePath: string, workspace?: string): string {
  if (!workspace) return filePath;
  // 确保 workspace 以 / 结尾
  const normalizedWorkspace = workspace.endsWith('/') ? workspace : workspace + '/';
  if (filePath.startsWith(normalizedWorkspace)) {
    return filePath.slice(normalizedWorkspace.length);
  }
  return filePath;
}

export interface ToolCallBlockProps {
  toolCall: ToolCall;
  isNested?: boolean;
  sessionId: string | null;
}

// 工具图标映射
const TOOL_ICONS: Record<string, React.ReactNode> = {
  Read: <FileText className="w-4 h-4" />,
  Write: <Pencil className="w-4 h-4" />,
  Edit: <Edit className="w-4 h-4" />,
  Bash: <Terminal className="w-4 h-4" />,
  Glob: <Search className="w-4 h-4" />,
  Grep: <SearchCode className="w-4 h-4" />,
  WebFetch: <Globe className="w-4 h-4" />,
  WebSearch: <Search className="w-4 h-4" />,
  Task: <ListTodo className="w-4 h-4" />,
};

// 工具显示名称 i18n key 映射
const TOOL_DISPLAY_NAME_KEYS: Record<string, string> = {
  Read: 'tool.readFile',
  Write: 'tool.writeFile',
  Edit: 'tool.editFile',
  Bash: 'tool.runCommand',
  Glob: 'tool.findFiles',
  Grep: 'tool.searchContent',
  WebFetch: 'tool.fetchUrl',
  WebSearch: 'tool.webSearch',
  Task: 'tool.runTask',
  TodoWrite: 'tool.updateTodos',
};

/**
 * 获取输入参数摘要
 */
function getInputSummary(name: string, args: Record<string, any>): string {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return String(args.file_path || '');
    case 'Bash': {
      const cmd = String(args.command || '');
      return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
    }
    case 'Glob':
    case 'Grep':
      return String(args.pattern || '');
    case 'WebFetch':
      return String(args.url || '');
    case 'WebSearch':
      return String(args.query || '');
    case 'Task':
      return String(args.description || '');
    default:
      return '';
  }
}

/**
 * 渲染 Write 工具的输入内容（无外层包装，直接输出代码）
 */
const WriteInputContent: React.FC<{ args: Record<string, any> }> = ({ args }) => {
  const filePath = String(args.file_path || '');
  const content = String(args.content || '');
  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);

  return (
    <div className="max-h-80 overflow-y-auto">
      <CodeBlockContent code={content} language={language} showLineNumbers />
    </div>
  );
};

/**
 * Diff 展示组件 - 类似代码块样式
 */
const DiffView: React.FC<{ oldStr: string; newStr: string }> = ({ oldStr, newStr }) => {
  const diffResult = useMemo(() => Diff.diffLines(oldStr, newStr), [oldStr, newStr]);

  // 计算行号
  let oldLineNum = 1;
  let newLineNum = 1;

  return (
    <div className="font-mono text-xs overflow-x-auto">
      {diffResult.map((part, index) => {
        const lines = part.value.split('\n');
        // 移除最后一个空行（split 产生的）
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }

        return lines.map((line, lineIndex) => {
          if (part.added) {
            const lineNum = newLineNum++;
            return (
              <div
                key={`${index}-${lineIndex}`}
                className="bg-green-500/20 flex"
              >
                <span className="select-none text-green-600 dark:text-green-400 w-12 shrink-0 text-right pr-2 py-0.5 bg-green-500/10">
                  {lineNum} +
                </span>
                <span className="text-green-700 dark:text-green-300 pl-3 pr-2 py-0.5 flex-1">
                  {line || ' '}
                </span>
              </div>
            );
          }
          if (part.removed) {
            const lineNum = oldLineNum++;
            return (
              <div
                key={`${index}-${lineIndex}`}
                className="bg-red-500/20 flex"
              >
                <span className="select-none text-red-600 dark:text-red-400 w-12 shrink-0 text-right pr-2 py-0.5 bg-red-500/10">
                  {lineNum} -
                </span>
                <span className="text-red-700 dark:text-red-300 pl-3 pr-2 py-0.5 flex-1">
                  {line || ' '}
                </span>
              </div>
            );
          }
          // 未变更的行，同时增加两个行号
          oldLineNum++;
          newLineNum++;
          return (
            <div
              key={`${index}-${lineIndex}`}
              className="flex"
            >
              <span className="select-none text-muted-foreground/50 w-12 shrink-0 text-right pr-2 py-0.5">
                {oldLineNum - 1}
              </span>
              <span className="text-muted-foreground pl-3 pr-2 py-0.5 flex-1">
                {line || ' '}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
};

/**
 * 渲染 Edit 工具的输入内容（无外层包装，直接输出 diff）
 */
const EditInputContent: React.FC<{ args: Record<string, any> }> = ({ args }) => {
  const oldString = String(args.old_string || '');
  const newString = String(args.new_string || '');

  return (
    <div className="max-h-80 overflow-y-auto">
      <DiffView oldStr={oldString} newStr={newString} />
    </div>
  );
};

/**
 * 默认输入内容展示（JSON 格式）
 */
const DefaultInputContent: React.FC<{ args: Record<string, any> }> = ({ args }) => {
  const { t } = useTranslation('message');
  return (
    <div className="px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">{t('tool.input')}</div>
      <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
        <CodeBlockContent code={JSON.stringify(args, null, 2)} language="json" showLineNumbers={false} />
      </div>
    </div>
  );
};

const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ toolCall, isNested = false, sessionId }) => {
  const { t } = useTranslation('message');
  // 从 chatStore 获取工具调用的运行时状态（流式期间可用）
  const toolExecution = useChatStore((state) => state.getToolExecution(sessionId, toolCall.id));

  // 从消息列表推断历史工具调用的完成状态
  const messages = useChatStore((state) => state.getMessages(sessionId));
  const derivedStatus = useMemo(() => {
    if (toolExecution?.status) return toolExecution.status;
    // 查找匹配的 ToolResultMessage
    const result = messages.find(
      (m) => m.role === 'toolResult' && (m as ToolResultMessage).toolCallId === toolCall.id
    ) as ToolResultMessage | undefined;
    if (result) return result.isError ? 'error' : 'completed';
    return 'pending';
  }, [toolExecution?.status, messages, toolCall.id]);

  const status = derivedStatus;
  const isError = toolExecution?.isError ?? (derivedStatus === 'error');

  // Write 和 Edit 工具：内容到齐后自动展开
  const isStandaloneTool = toolCall.name === 'Write' || toolCall.name === 'Edit';
  const argsAvailable = !!toolCall.arguments && Object.keys(toolCall.arguments).length > 0;
  const [isExpanded, setIsExpanded] = useState(isStandaloneTool && argsAvailable);

  useEffect(() => {
    if (isStandaloneTool && argsAvailable) {
      setIsExpanded(true);
    }
  }, [isStandaloneTool, argsAvailable]);

  const icon = TOOL_ICONS[toolCall.name] || <Settings className="w-4 h-4" />;
  const displayNameKey = TOOL_DISPLAY_NAME_KEYS[toolCall.name];
  const displayName = displayNameKey ? t(displayNameKey) : toolCall.name;
  const inputSummary = getInputSummary(toolCall.name, toolCall.arguments as Record<string, any>);

  // Write/Edit: 从 args 取文件相对路径用于标题
  const workspace = useSessionStore((state) => state.getCurrentWorkspace());
  const standaloneFilePath = isStandaloneTool
    ? truncateFilePath(String((toolCall.arguments as Record<string, any>)?.file_path || ''), workspace)
    : '';

  // 状态图标和样式
  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />,
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />,
    completed: <Check className="w-3.5 h-3.5 text-green-500" />,
    error: <X className="w-3.5 h-3.5 text-red-500" />,
  }[status];

  // 根据工具类型渲染不同的输入内容
  const renderInputContent = () => {
    const argsIsEmpty = !toolCall.arguments || Object.keys(toolCall.arguments).length === 0;

    if (argsIsEmpty) {
      return null;
    }

    switch (toolCall.name) {
      case 'Write':
        return <WriteInputContent args={toolCall.arguments as Record<string, any>} />;
      case 'Edit':
        return <EditInputContent args={toolCall.arguments as Record<string, any>} />;
      default:
        return <DefaultInputContent args={toolCall.arguments as Record<string, any>} />;
    }
  };

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isError
        ? 'border-red-500/30 bg-red-500/5'
        : isNested
          ? 'border-border/50 bg-muted/50'
          : 'border-border bg-muted'
    } ${isNested ? '' : 'mb-2'}`}>
      {/* 头部 - 可点击折叠 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground"
      >
        {/* 折叠图标 */}
        <ChevronRight className={`w-3 h-3 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />

        {/* 工具图标 */}
        <span className="shrink-0">{icon}</span>

        {/* 工具名称 + 文件路径（Write/Edit） */}
        <span className="font-medium text-sm shrink-0">{displayName}</span>
        {standaloneFilePath && (
          <span className="text-xs opacity-70 truncate flex-1 font-mono">
            {standaloneFilePath}
          </span>
        )}

        {/* 输入摘要 - Write/Edit 工具不显示（已在标题中） */}
        {inputSummary && !isStandaloneTool && (
          <span className="text-xs opacity-70 truncate flex-1 font-mono">
            {inputSummary}
          </span>
        )}

        {/* 状态图标 */}
        <span className="shrink-0 ml-auto">{statusIcon}</span>
      </button>

      {/* 展开的详情 */}
      {isExpanded && (
        <div className="border-t border-inherit">
          {/* 输入参数 - 根据工具类型显示不同内容 */}
          {renderInputContent()}

          {/* 运行中状态提示 */}
          {(status === 'running' || status === 'pending') && (
            <div className="px-3 py-2 border-t border-inherit">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {status === 'running' ? t('tool.executing') : t('tool.waiting')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallBlock;
