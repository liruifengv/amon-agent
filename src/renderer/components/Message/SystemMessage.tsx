import React from 'react';
import type { AssistantMessage } from '../../types';
import ContentBlockRenderer from './ContentBlocks';

export interface SystemMessageProps {
  message: AssistantMessage;
}

/**
 * 系统消息组件 - 用于显示权限响应等系统信息
 */
const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => {
  const blocks = message.content;

  if (!blocks || blocks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-start">
      <div>
        {blocks.map((block, index) => (
          <ContentBlockRenderer
            key={`block-${index}`}
            block={block}
            isStreaming={false}
            isLastBlock={index === blocks.length - 1}
            sessionId={null}
          />
        ))}
      </div>
    </div>
  );
};

export default SystemMessage;
