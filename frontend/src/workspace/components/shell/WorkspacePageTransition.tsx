'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { workspacePageId } from '@/workspace/lib/pageIdentity';

interface WorkspacePageTransitionProps {
  children: ReactNode;
  pathname: string;
}

export default function WorkspacePageTransition({ children, pathname }: WorkspacePageTransitionProps) {
  const shouldReduceMotion = useReducedMotion();
  const pageId = workspacePageId(pathname);

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={pageId}
        id={pageId}
        data-workspace-page-id={pageId}
        data-workspace-pathname={pathname}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
        transition={shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
