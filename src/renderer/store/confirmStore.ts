import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  resolve: ((value: boolean) => void) | null;
}

export const useConfirmStore = create<ConfirmState>(() => ({
  open: false,
  title: '',
  message: '',
  resolve: null,
}));

export function confirm(opts: { title?: string; message: string }): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({
      open: true,
      title: opts.title ?? '',
      message: opts.message,
      resolve,
    });
  });
}

export function resolveConfirm(value: boolean): void {
  const { resolve } = useConfirmStore.getState();
  resolve?.(value);
  useConfirmStore.setState({
    open: false,
    title: '',
    message: '',
    resolve: null,
  });
}
