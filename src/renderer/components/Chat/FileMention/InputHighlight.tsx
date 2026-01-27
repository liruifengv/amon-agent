import React, { useMemo, useEffect, useRef, useCallback } from 'react';

interface InputHighlightProps {
  text: string;
  mentionedPaths: string[];
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * 解析文本中的 @ 提及并生成高亮片段
 */
function parseHighlights(text: string, mentionedPaths: string[]): Array<{ text: string; isHighlight: boolean }> {
  if (mentionedPaths.length === 0) {
    return [{ text, isHighlight: false }];
  }

  const segments: Array<{ text: string; isHighlight: boolean }> = [];
  let remaining = text;

  // 为每个提及的路径创建正则匹配
  const sortedPaths = [...mentionedPaths].sort((a, b) => b.length - a.length);

  while (remaining.length > 0) {
    let earliestMatch: { index: number; path: string } | null = null;

    // 查找最早出现的 @path
    for (const path of sortedPaths) {
      const pattern = `@${path}`;
      const index = remaining.indexOf(pattern);
      if (index !== -1 && (earliestMatch === null || index < earliestMatch.index)) {
        earliestMatch = { index, path };
      }
    }

    if (earliestMatch) {
      // 添加高亮前的普通文本
      if (earliestMatch.index > 0) {
        segments.push({
          text: remaining.slice(0, earliestMatch.index),
          isHighlight: false,
        });
      }

      // 添加高亮文本
      segments.push({
        text: `@${earliestMatch.path}`,
        isHighlight: true,
      });

      // 更新剩余文本
      remaining = remaining.slice(earliestMatch.index + earliestMatch.path.length + 1);
    } else {
      // 没有更多匹配，添加剩余文本
      if (remaining.length > 0) {
        segments.push({
          text: remaining,
          isHighlight: false,
        });
      }
      break;
    }
  }

  return segments;
}

const InputHighlight: React.FC<InputHighlightProps> = ({
  text,
  mentionedPaths,
  className,
  textareaRef,
}) => {
  const highlightRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(
    () => parseHighlights(text, mentionedPaths),
    [text, mentionedPaths]
  );

  // 同步 textarea 的滚动位置
  const syncScroll = useCallback(() => {
    if (textareaRef?.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, [textareaRef]);

  useEffect(() => {
    const textarea = textareaRef?.current;
    if (!textarea) return;

    // 监听 textarea 的滚动事件
    textarea.addEventListener('scroll', syncScroll);

    // 初始同步
    syncScroll();

    return () => {
      textarea.removeEventListener('scroll', syncScroll);
    };
  }, [textareaRef, syncScroll]);

  return (
    <div
      ref={highlightRef}
      className={className}
      aria-hidden="true"
    >
      {segments.map((segment, index) =>
        segment.isHighlight ? (
          <span
            key={index}
            className="bg-primary/20 text-primary rounded px-0.5 -mx-0.5"
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
      {/* 保持与 textarea 一致的换行行为 */}
      {text.endsWith('\n') && <br />}
    </div>
  );
};

export default InputHighlight;
