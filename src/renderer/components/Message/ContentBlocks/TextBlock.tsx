import React, { memo } from 'react';
import { Streamdown } from 'streamdown';

export interface TextBlockProps {
  content: string;
  isStreaming?: boolean;
}

const TextBlock: React.FC<TextBlockProps> = memo(({ content, isStreaming }) => {
  return (
    <div className="markdown-content">
      <Streamdown>{content}</Streamdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-gray-400 dark:bg-gray-500 animate-pulse ml-0.5" />
      )}
    </div>
  );
});

TextBlock.displayName = 'TextBlock';

export default TextBlock;
