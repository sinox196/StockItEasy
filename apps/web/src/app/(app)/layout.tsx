'use client';

import { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/shell/require-auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
