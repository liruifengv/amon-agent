import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { Square, ArrowUp, Paperclip, X } from 'lucide-react';
import { ImageAttachment, ImageMimeType } from '../../types';
import { useFileMention, FileMentionPopover, InputHighlight } from './FileMention';

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// 生成简单的唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface InputAreaProps {
  onMessageSent?: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({ onMessageSent }) => {
  const { t } = useTranslation('chat');
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { sendMessage, interruptMessage, isSessionLoading } = useChatStore();
  const { currentSessionId } = useSessionStore();

  // 当前会话是否正在加载
  const isLoading = isSessionLoading(currentSessionId);

  // @ 文件提及功能
  const fileMention = useFileMention({
    input,
    onChange: setInput,
    textareaRef,
  });

  // 自动聚焦输入框
  useEffect(() => {
    if (currentSessionId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [currentSessionId]);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // 处理文件列表，将图片转换为 ImageAttachment
  const processFiles = useCallback(async (files: FileList | File[]) => {
    if (!currentSessionId || images.length >= MAX_IMAGES) return;

    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(
      file => SUPPORTED_TYPES.includes(file.type) && file.size <= MAX_IMAGE_SIZE
    );

    const newImages: ImageAttachment[] = [];
    const remainingSlots = MAX_IMAGES - images.length;

    for (const file of imageFiles.slice(0, remainingSlots)) {
      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // 移除 data:xxx;base64, 前缀
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newImages.push({
          id: generateId(),
          filename: file.name || 'pasted-image',
          mimeType: file.type as ImageMimeType,
          base64Data,
          size: file.size,
        });
      } catch (error) {
        console.error('Failed to read image file:', error);
      }
    }

    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages].slice(0, MAX_IMAGES));
    }
  }, [currentSessionId, images.length]);

  // 拖拽事件处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentSessionId && images.length < MAX_IMAGES) {
      setIsDragging(true);
    }
  }, [currentSessionId, images.length]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开容器时才取消拖拽状态
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!currentSessionId || images.length >= MAX_IMAGES) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  }, [currentSessionId, images.length, processFiles]);

  // 粘贴事件处理
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!currentSessionId || images.length >= MAX_IMAGES) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault(); // 阻止默认粘贴行为
      processFiles(imageFiles);
    }
  }, [currentSessionId, images.length, processFiles]);

  // 选择图片
  const handleSelectImages = async () => {
    if (!currentSessionId) return;

    const result = await window.electronAPI.dialog.selectImages();
    if (result.success && result.images.length > 0) {
      // 过滤掉超过大小限制的图片
      const validImages = result.images.filter(img => img.size <= MAX_IMAGE_SIZE);
      // 限制最大数量
      setImages(prev => [...prev, ...validImages].slice(0, MAX_IMAGES));
    }
  };

  // 移除图片
  const handleRemoveImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleSubmit = async () => {
    // 允许只发送图片（无文本）
    if ((!input.trim() && images.length === 0) || !currentSessionId || isLoading) return;

    const message = input.trim();
    const attachedImages = [...images];

    setInput('');
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // 发送前滚动到底部
    onMessageSent?.();

    await sendMessage(message, currentSessionId, undefined, attachedImages.length > 0 ? attachedImages : undefined);

    // 发送后重新聚焦
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 先让 fileMention 处理键盘事件
    if (fileMention.handleKeyDown(e)) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInterrupt = () => {
    if (currentSessionId) {
      interruptMessage(currentSessionId);
    }
  };

  const canSend = !!((input.trim() || images.length > 0) && currentSessionId && !isLoading);

  return (
    <div className="bg-background px-4 pb-4">
      <div className="max-w-3xl mx-auto">
        {/* 输入框容器 */}
        <div
          ref={containerRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.05)]
            transition-colors
            ${isDragging
              ? 'border-primary border-2'
              : 'border-border'
            }
          `}
        >
          {/* 图片预览区域 */}
          {images.length > 0 && (
            <div className="p-3 pb-0 flex flex-wrap gap-2">
              {images.map(img => (
                <div key={img.id} className="relative group">
                  <img
                    src={`data:${img.mimeType};base64,${img.base64Data}`}
                    alt={img.filename}
                    className="w-16 h-16 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={() => handleRemoveImage(img.id)}
                    className="
                      absolute -top-1.5 -right-1.5
                      w-5 h-5 flex items-center justify-center
                      bg-destructive text-destructive-foreground
                      rounded-full opacity-0 group-hover:opacity-100
                      transition-opacity
                    "
                    title={t('removeImage')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 上半部分：输入区域 */}
          <div className="p-3 pb-2 relative">
              {/* 高亮覆盖层 - 与 textarea 样式完全同步 */}
              {fileMention.mentionedPaths.length > 0 && (
                <InputHighlight
                  text={input}
                  mentionedPaths={fileMention.mentionedPaths}
                  textareaRef={textareaRef}
                  className="
                    absolute top-3 left-3 right-3 bottom-2 py-2 px-2
                    pointer-events-none whitespace-pre-wrap break-words
                    overflow-hidden max-h-32
                    text-sm leading-normal font-sans
                  "
                />
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={currentSessionId ? t('askAmon') : t('selectOrCreateFirst')}
                disabled={!currentSessionId}
                rows={1}
                className={`
                  w-full py-2 px-2
                  bg-transparent border-0 resize-none
                  placeholder:text-muted-foreground
                  focus:outline-none focus:ring-0
                  disabled:opacity-50 disabled:cursor-not-allowed
                  max-h-32 overflow-y-auto
                  text-sm leading-normal font-sans
                  ${fileMention.mentionedPaths.length > 0
                    ? 'text-transparent caret-foreground'
                    : 'text-foreground'
                  }
                `}
                style={{ height: 'auto' }}
              />
              {/* 文件提及下拉框 */}
              <FileMentionPopover
                isOpen={fileMention.isOpen}
                files={fileMention.files}
                isLoading={fileMention.isLoading}
                selectedIndex={fileMention.selectedIndex}
                position={fileMention.triggerPosition}
                onSelect={fileMention.selectFile}
                onClose={fileMention.close}
              />
          </div>

          {/* 下半部分：工具栏 */}
          <div className="flex items-center justify-between px-3 pb-3">
              {/* 左侧：附件按钮 + 选择器 */}
              <div className="flex items-center gap-2">
                {/* 附件按钮 */}
                <button
                  onClick={handleSelectImages}
                  disabled={!currentSessionId || images.length >= MAX_IMAGES}
                  className={`
                    p-2 rounded-lg transition-colors
                    ${currentSessionId && images.length < MAX_IMAGES
                      ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      : 'text-muted-foreground opacity-50 cursor-not-allowed'
                    }
                  `}
                  title={images.length >= MAX_IMAGES ? `${t('addImage')} (max ${MAX_IMAGES})` : t('addImage')}
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <ProviderSelector />
                {currentSessionId && <PermissionModeSelector sessionId={currentSessionId} />}
              </div>

              {/* 右侧：发送/停止按钮 */}
              {isLoading ? (
                <button
                  onClick={handleInterrupt}
                  className="
                    w-9 h-9 flex items-center justify-center flex-shrink-0
                    bg-muted-foreground hover:bg-muted-foreground/80
                    text-background rounded-full
                    transition-colors
                  "
                  title={t('stopGenerating')}
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className={`
                    w-9 h-9 flex items-center justify-center flex-shrink-0
                    rounded-full transition-colors border
                    ${canSend
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                      : 'bg-primary/10 text-primary/40 border-primary/20 cursor-not-allowed'
                    }
                  `}
                  title={t('sendMessage')}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 导入所需的组件
import ProviderSelector from './ProviderSelector';
import PermissionModeSelector from './PermissionModeSelector';

export default InputArea;
