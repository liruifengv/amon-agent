import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmStore, resolveConfirm } from '../store/confirmStore';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';

const ConfirmDialog: React.FC = () => {
  const { t } = useTranslation('common');
  const { open, title, message } = useConfirmStore();

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) resolveConfirm(false); }}>
      <AlertDialogContent className="max-w-sm gap-3 p-5">
        <AlertDialogHeader className="space-y-1.5">
          {title && <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>}
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolveConfirm(false)} className="h-9 px-3 text-sm">
            {t('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => resolveConfirm(true)} className="h-9 px-3 text-sm">
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmDialog;
