import { adminUi } from '@/admin/lib/ui';
import type { ReactNode } from 'react';
import { AdminAuthProvider } from "@/admin/components/AdminAuthProvider";

export const metadata = {
  title: "Bippa Admin — Editor da home",
  description: "Plataforma de personalização do catálogo",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={adminUi.root}>
      <AdminAuthProvider>{children}</AdminAuthProvider>
    </div>
  );
}
