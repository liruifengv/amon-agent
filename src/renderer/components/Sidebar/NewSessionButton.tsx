import React from 'react';
import { useTranslation } from 'react-i18next';
import { SquarePen } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { Button } from '../ui/button';

interface NewSessionButtonProps {
  onCreated?: () => void;
}

const NewSessionButton: React.FC<NewSessionButtonProps> = ({ onCreated }) => {
  const { t } = useTranslation('sidebar');
  const { createSession } = useSessionStore();

  const handleCreate = async () => {
    await createSession();
    onCreated?.();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCreate}
      className="h-8 w-8"
      title={t('newSession')}
    >
      <SquarePen className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
};

export default NewSessionButton;
