'use client';
import { Toaster } from 'sonner';

export function AppToaster() {
  return <Toaster position="bottom-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />;
}
