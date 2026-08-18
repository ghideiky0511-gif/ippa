import { adminUi } from '@/workspace/lib/ui';
import type { ReactNode } from 'react';
import { WorkspaceAuthProvider } from "@/workspace/components/WorkspaceAuthProvider";

export const metadata = {
  title: "Bippa — Workspace interno",
  description: "Área operacional da equipe do tenant",
};

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className={adminUi.root}>
      <WorkspaceAuthProvider>{children}</WorkspaceAuthProvider>
    </div>
  );
}
