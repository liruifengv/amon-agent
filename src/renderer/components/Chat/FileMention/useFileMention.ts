import { useState, useCallback, useRef, useEffect } from 'react';
import { FileInfo } from '../../../types';
import { useSessionStore } from '../../../store/sessionStore';

interface UseFileMentionOptions {
  input: string;
  onChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface UseFileMentionReturn {
  isOpen: boolean;
  files: FileInfo[];
  isLoading: boolean;
  selectedIndex: number;
  triggerPosition: { top: number; left: number } | null;
  mentionedPaths: string[];
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  selectFile: (file: FileInfo) => void;
  close: () => void;
}

/**
 * 检测光标前是否有 @xxx 模式
 * 返回 @ 后的查询字符串和 @ 的位置
 */
function detectMentionTrigger(
  input: string,
  cursorPos: number
): { query: string; atIndex: number } | null {
  // 从光标位置向前查找 @
  const textBeforeCursor = input.slice(0, cursorPos);

  // 从后向前找 @
  const atIndex = textBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;

  // 检查 @ 前面是否是单词边界（空白或开头）
  if (atIndex > 0) {
    const charBefore = textBeforeCursor[atIndex - 1];
    // 如果 @ 前面不是空白字符，可能是邮箱
    if (!/\s/.test(charBefore)) {
      return null;
    }
  }

  // 检查 @ 后面到光标位置之间是否有空格（如果有则不触发）
  const query = textBeforeCursor.slice(atIndex + 1);
  if (/\s/.test(query)) {
    return null;
  }

  return { query, atIndex };
}

/**
 * 获取字符在 textarea 中的位置
 */
function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  // 创建一个隐藏的 div 来测量文本位置
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  // 复制 textarea 的样式
  const properties = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'border',
    'borderWidth',
    'boxSizing',
    'whiteSpace',
    'wordWrap',
    'wordBreak',
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';

  properties.forEach((prop) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div.style[prop as any] = style.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase()
    );
  });

  div.style.width = `${textarea.clientWidth}px`;
  div.style.overflow = 'hidden';

  // 设置内容
  const text = textarea.value.substring(0, position);
  div.textContent = text;

  // 添加一个 span 来标记光标位置
  const span = document.createElement('span');
  span.textContent = textarea.value.substring(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);

  const textareaRect = textarea.getBoundingClientRect();

  // 计算相对于 textarea 的位置
  const top = span.offsetTop - textarea.scrollTop;
  const left = span.offsetLeft;

  document.body.removeChild(div);

  return {
    top: textareaRect.top + top,
    left: textareaRect.left + left,
  };
}

export function useFileMention({
  input,
  onChange,
  textareaRef,
}: UseFileMentionOptions): UseFileMentionReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const [mentionedPaths, setMentionedPaths] = useState<string[]>([]);

  const { currentSessionId, getCurrentWorkspace } = useSessionStore();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const currentTriggerRef = useRef<{ query: string; atIndex: number } | null>(null);
  const lastQueryRef = useRef<string>('');
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 获取当前 workspace
  const workspace = getCurrentWorkspace();

  // 检测 @ 触发
  useEffect(() => {
    if (!textareaRef.current || !currentSessionId || !workspace) {
      setIsOpen(false);
      return;
    }

    const cursorPos = textareaRef.current.selectionStart;
    const trigger = detectMentionTrigger(input, cursorPos);

    if (trigger) {
      currentTriggerRef.current = trigger;

      // 计算弹出框位置
      const position = getCaretCoordinates(textareaRef.current, trigger.atIndex);
      setTriggerPosition(position);
      setIsOpen(true);
      setSelectedIndex(0);

      // 如果查询没变，不需要重新搜索
      if (trigger.query === lastQueryRef.current) {
        return;
      }
      lastQueryRef.current = trigger.query;

      // 防抖搜索文件
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        // 延迟显示 loading 状态，避免快速搜索时闪烁
        loadingTimerRef.current = setTimeout(() => {
          setIsLoading(true);
        }, 200);

        try {
          const result = await window.ipc.workspace.listFiles(
            currentSessionId,
            trigger.query || undefined,
            50
          );
          if (Array.isArray(result)) {
            setFiles(result);
          }
        } catch (error) {
          console.error('Failed to list files:', error);
        } finally {
          if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current);
          }
          setIsLoading(false);
        }
      }, 150);
    } else {
      currentTriggerRef.current = null;
      lastQueryRef.current = '';
      setIsOpen(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [input, currentSessionId, workspace, textareaRef]);

  // 选择文件
  const selectFile = useCallback(
    (file: FileInfo) => {
      if (!currentTriggerRef.current || !textareaRef.current) return;

      const { atIndex } = currentTriggerRef.current;
      const cursorPos = textareaRef.current.selectionStart;

      // 替换 @query 为文件路径
      const before = input.slice(0, atIndex);
      const after = input.slice(cursorPos);
      const newValue = `${before}@${file.path} ${after}`;

      onChange(newValue);

      // 记录提及的路径
      setMentionedPaths((prev) => {
        if (!prev.includes(file.path)) {
          return [...prev, file.path];
        }
        return prev;
      });

      setIsOpen(false);

      // 设置光标位置
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newCursorPos = atIndex + 1 + file.path.length + 1;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
        }
      });
    },
    [input, onChange, textareaRef]
  );

  // 关闭
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // 键盘处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen) return false;

      switch (e.key) {
        case 'ArrowDown':
          if (files.length === 0) return false;
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % files.length);
          return true;

        case 'ArrowUp':
          if (files.length === 0) return false;
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + files.length) % files.length);
          return true;

        case 'Enter':
        case 'Tab':
          if (files.length === 0) return false;
          e.preventDefault();
          if (files[selectedIndex]) {
            selectFile(files[selectedIndex]);
          }
          return true;

        case 'Escape':
          e.preventDefault();
          close();
          return true;

        default:
          return false;
      }
    },
    [isOpen, files, selectedIndex, selectFile, close]
  );

  // 当 input 被清空时，重置 mentionedPaths
  useEffect(() => {
    if (!input.trim()) {
      setMentionedPaths([]);
    }
  }, [input]);

  return {
    isOpen,
    files,
    isLoading,
    selectedIndex,
    triggerPosition,
    mentionedPaths,
    handleKeyDown,
    selectFile,
    close,
  };
}
