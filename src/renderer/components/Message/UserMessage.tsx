import React from 'react';
import { Message } from '../../types';

export interface UserMessageProps {
  message: Message;
}

/**
 * 用户消息组件
 */
const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  return (
    <div className="px-4 py-3 bg-[#7299a0] dark:bg-[#393d42] text-white rounded-2xl rounded-br-md text-[15px] leading-relaxed">
      <div className="whitespace-pre-wrap">{message.content}</div>
    </div>
  );
};

export default UserMessage;
