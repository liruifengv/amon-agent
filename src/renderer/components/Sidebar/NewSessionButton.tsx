import React from 'react';
import { SquarePen } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { Button } from '../ui/button';

const NewSessionButton: React.FC = () => {
  const { createSession } = useSessionStore();

  const handleCreate = async () => {
    await createSession();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCreate}
      className="h-8 w-8"
      title="新建会话"
    >
      <SquarePen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
    </Button>
  );
};

export default NewSessionButton;
