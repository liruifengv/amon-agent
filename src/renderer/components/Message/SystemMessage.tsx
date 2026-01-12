import React from 'react';
import { Message } from '../../types';
import ContentBlockRenderer from './ContentBlocks';

export interface SystemMessageProps {
  message: Message;
}

/**
 * 系统消息组件 - 用于显示权限响应等系统信息
 */
const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => {
  const { contentBlocks } = message;

  if (!contentBlocks || contentBlocks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[80%]">
        {contentBlocks.map((block, index) => (
          <ContentBlockRenderer
            key={`block-${index}`}
            block={block}
            isStreaming={false}
            isLastBlock={index === contentBlocks.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

export default SystemMessage;
