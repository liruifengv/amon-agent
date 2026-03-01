import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerToolUseBlock, ServerToolResultBlock, CodeExecutionResultContent, WebFetchResultContent, WebSearchResultItem } from '../../../types';
import { useChatStore } from '../../../store/chatStore';
import {
  Globe,
  Code2,
  Search,
  ChevronRight,
  Check,
  Loader2,
  Server,
} from 'lucide-react';
import { CodeBlockContent } from '../../ai-elements/code-block';

// Server tool icons
const SERVER_TOOL_ICONS: Record<string, React.ReactNode> = {
  code_execution: <Code2 className="w-4 h-4" />,
  web_fetch: <Globe className="w-4 h-4" />,
  web_search: <Search className="w-4 h-4" />,
};

// Server tool display names
const SERVER_TOOL_NAMES: Record<string, string> = {
  code_execution: 'Code Execution',
  web_fetch: 'Web Fetch',
  web_search: 'Web Search',
};

/**
 * Get a short summary for the server tool input
 */
function getServerToolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'web_fetch':
      return String(input.url || '');
    case 'web_search':
      return String(input.query || '');
    case 'code_execution': {
      const code = String(input.code || '');
      if (!code) return '';
      const firstLine = code.trim().split('\n')[0] || '';
      return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
    }
    default:
      return '';
  }
}

export interface ServerToolBlockProps {
  block: ServerToolUseBlock;
  sessionId: string | null;
  /** Matching result block (if available) */
  resultBlock?: ServerToolResultBlock;
}

const ServerToolBlock: React.FC<ServerToolBlockProps> = ({ block, sessionId, resultBlock }) => {
  const { t } = useTranslation('message');
  const toolCallState = useChatStore((state) => state.getToolCallState(sessionId, block.id));
  const [isExpanded, setIsExpanded] = useState(false);

  const status = toolCallState?.status ?? (resultBlock ? 'completed' : 'pending');
  const icon = SERVER_TOOL_ICONS[block.name] || <Server className="w-4 h-4" />;
  const displayName = SERVER_TOOL_NAMES[block.name] || block.name;
  const summary = getServerToolSummary(block.name, block.input);

  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />,
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />,
    completed: <Check className="w-3.5 h-3.5 text-green-500" />,
    error: null,
  }[status];

  const renderInput = () => {
    if (!block.input || Object.keys(block.input).length === 0) return null;

    if (block.name === 'code_execution' && block.input.code) {
      return (
        <div className="max-h-80 overflow-y-auto">
          <CodeBlockContent
            code={String(block.input.code)}
            language="python"
            showLineNumbers
          />
        </div>
      );
    }

    if (block.name === 'web_fetch' && block.input.url) {
      return (
        <div className="px-3 py-2">
          <div className="text-xs text-muted-foreground font-mono truncate">
            {String(block.input.url)}
          </div>
        </div>
      );
    }

    if (block.name === 'web_search' && block.input.query) {
      return (
        <div className="px-3 py-2">
          <div className="text-xs text-muted-foreground font-mono truncate">
            {String(block.input.query)}
          </div>
        </div>
      );
    }

    return (
      <div className="px-3 py-2">
        <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
          <CodeBlockContent
            code={JSON.stringify(block.input, null, 2)}
            language="json"
            showLineNumbers={false}
          />
        </div>
      </div>
    );
  };

  const renderResult = () => {
    if (!resultBlock) return null;

    if (!resultBlock.content) return null;

    if (resultBlock.resultType === 'code_execution_result') {
      const codeResult = resultBlock.content as unknown as CodeExecutionResultContent;
      const stdout = String(codeResult.stdout || '');
      const stderr = String(codeResult.stderr || '');
      const returnCode = codeResult.return_code ?? 0;

      return (
        <div className="px-3 py-2 border-t border-inherit">
          <div className={`text-xs font-medium mb-1 ${
            returnCode !== 0 ? 'text-red-500' : 'text-muted-foreground'
          }`}>
            {t('tool.output')} {returnCode !== 0 ? `(exit ${returnCode})` : ''}
          </div>
          {stdout && (
            <pre className="text-xs font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto bg-black/5 dark:bg-white/10 text-foreground">
              {stdout}
            </pre>
          )}
          {stderr && (
            <pre className="text-xs font-mono rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-red-500/10 text-red-700 dark:text-red-400">
              {stderr}
            </pre>
          )}
        </div>
      );
    }

    if (resultBlock.resultType === 'web_search_tool_result') {
      const results = resultBlock.content as unknown as WebSearchResultItem[];
      if (!Array.isArray(results) || results.length === 0) return null;

      return (
        <div className="px-3 py-2 border-t border-inherit">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t('tool.output')} ({results.length} results)
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {results.map((item, i) => (
              <div key={i} className="text-xs">
                <a href={item.url} className="text-primary hover:underline font-medium"
                   target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                {item.page_age && (
                  <span className="ml-2 text-muted-foreground opacity-50">{item.page_age}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (resultBlock.resultType === 'web_fetch_result') {
      const fetchResult = resultBlock.content as unknown as WebFetchResultContent;
      const url = String(fetchResult.url || '');
      const retrievedAt = String(fetchResult.retrieved_at || '');

      return (
        <div className="px-3 py-2 border-t border-inherit">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">{t('tool.output')}</span>
            <span className="ml-2 font-mono opacity-70">{url}</span>
            {retrievedAt && (
              <span className="ml-2 opacity-50">
                {new Date(retrievedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      );
    }

    // Generic result display
    return (
      <div className="px-3 py-2 border-t border-inherit">
        <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
          <CodeBlockContent
            code={JSON.stringify(resultBlock.content, null, 2)}
            language="json"
            showLineNumbers={false}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border overflow-hidden border-border bg-muted mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground"
      >
        <ChevronRight className={`w-3 h-3 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
        <span className="shrink-0">{icon}</span>
        <span className="font-medium text-sm shrink-0">{displayName}</span>
        {summary && (
          <span className="text-xs opacity-70 truncate flex-1 font-mono">
            {summary}
          </span>
        )}
        <span className="shrink-0 ml-auto">{statusIcon}</span>
      </button>

      {isExpanded && (
        <div className="border-t border-inherit">
          {renderInput()}
          {renderResult()}
          {status === 'pending' && !resultBlock && (
            <div className="px-3 py-2 border-t border-inherit">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('tool.executing')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServerToolBlock;
