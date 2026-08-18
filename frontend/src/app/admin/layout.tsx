import type { ReactNode } from 'react';
import "@/admin/admin.css";
import { AdminAuthProvider } from "@/admin/components/AdminAuthProvider";

export const metadata = {
  title: "Bippa Admin — Editor da home",
  description: "Plataforma de personalização do catálogo",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-root">
      <AdminAuthProvider>{children}</AdminAuthProvider>
    </div>
  );
}
