import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserMessage as UserMessageType, TextContent, ImageContent } from '../../types';
import { useSessionStore } from '../../store/sessionStore';

export interface UserMessageProps {
  message: UserMessageType;
}

/** Extract the text string from a UserMessage's content field */
function extractText(content: string | (TextContent | ImageContent)[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

/** Extract image data URIs from a UserMessage's content field */
function extractImages(content: string | (TextContent | ImageContent)[]): { data: string; mimeType: string }[] {
  if (typeof content === 'string') return [];
  return content
    .filter((c): c is ImageContent => c.type === 'image')
    .map((c) => ({ data: c.data, mimeType: c.mimeType }));
}

/**
 * 从文本中提取所有 @path 模式
 */
function extractMentionedPaths(text: string): string[] {
  const paths: string[] = [];
  // 匹配 @ 后面跟着非空白字符的模式
  const regex = /@([^\s@]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

/**
 * 渲染带高亮的文本内容
 */
function renderHighlightedContent(
  text: string,
  validPaths: string[]
): React.ReactNode[] {
  if (validPaths.length === 0) {
    return [text];
  }

  const result: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // 按长度排序，优先匹配长路径
  const sortedPaths = [...validPaths].sort((a, b) => b.length - a.length);

  while (remaining.length > 0) {
    let earliestMatch: { index: number; path: string } | null = null;

    for (const path of sortedPaths) {
      const pattern = `@${path}`;
      const index = remaining.indexOf(pattern);
      if (index !== -1 && (earliestMatch === null || index < earliestMatch.index)) {
        earliestMatch = { index, path };
      }
    }

    if (earliestMatch) {
      if (earliestMatch.index > 0) {
        result.push(remaining.slice(0, earliestMatch.index));
      }

      result.push(
        <span
          key={keyIndex++}
          className="bg-primary/30 text-primary-foreground dark:text-primary rounded px-1 py-0.5 font-medium"
        >
          @{earliestMatch.path}
        </span>
      );

      remaining = remaining.slice(earliestMatch.index + earliestMatch.path.length + 1);
    } else {
      result.push(remaining);
      break;
    }
  }

  return result;
}

/**
 * 用户消息组件
 */
const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const { t } = useTranslation('message');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [validPaths, setValidPaths] = useState<string[]>([]);
  const { currentSessionId } = useSessionStore();

  const text = useMemo(() => extractText(message.content), [message.content]);
  const images = useMemo(() => extractImages(message.content), [message.content]);

  // 提取消息中的所有 @path
  const mentionedPaths = useMemo(
    () => extractMentionedPaths(text),
    [text]
  );

  // 验证路径是否存在
  useEffect(() => {
    if (!currentSessionId || mentionedPaths.length === 0) {
      return;
    }

    let cancelled = false;

    // 先重置，然后异步获取
    const fetchValidPaths = async () => {
      try {
        const results: boolean[] = await window.ipc.workspace.validatePaths(
          mentionedPaths
        );
        if (!cancelled && Array.isArray(results)) {
          // 从 boolean[] 结果中筛选出有效路径
          const valid = mentionedPaths.filter((_, index) => results[index]);
          setValidPaths(valid);
        }
      } catch {
        // 忽略错误
      }
    };

    fetchValidPaths();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, mentionedPaths]);

  // 渲染高亮内容
  const highlightedContent = useMemo(
    () => renderHighlightedContent(text, validPaths),
    [text, validPaths]
  );

  return (
    <div className="px-4 py-3 bg-user-bubble text-user-bubble-foreground rounded-2xl rounded-br-md text-[15px] leading-relaxed overflow-hidden">
      {/* 图片预览 */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={`data:${img.mimeType};base64,${img.data}`}
              alt={`image-${idx}`}
              onClick={() => setExpandedImage(`data:${img.mimeType};base64,${img.data}`)}
              className="max-w-48 max-h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity object-cover"
            />
          ))}
        </div>
      )}

      {/* 文本内容 */}
      {text && (
        <div className="whitespace-pre-wrap break-words">{highlightedContent}</div>
      )}

      {/* 图片放大查看模态框 */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt={t('enlargeImage')}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
};

export default UserMessage;
