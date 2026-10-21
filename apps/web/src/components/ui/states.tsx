'use client';

import { AlertTriangle, Inbox } from 'lucide-react';
import { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon ?? <Inbox className="size-6" />}</div>
      <div>
        <p className="font-semibold">{title ?? t('common.emptyTitle')}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description ?? t('common.emptyDescription')}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, te } = useI18n();
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-danger-soft p-3 text-danger">
        <AlertTriangle className="size-6" />
      </div>
      <div>
        <p className="font-semibold">{t('common.errorTitle')}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{code ? te(code) : t('common.errorDescription')}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

/** Renders loading / error / empty / content for a query result. */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  skeleton,
  children,
}: {
  query: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  empty?: ReactNode;
  isEmpty?: (d: T) => boolean;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <TableSkeleton />}</>;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState />}</>;
  return <>{children(query.data)}</>;
}

/** Bidirectional-safe number/code display: never mirrored in RTL. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn('num', className)}>
      {children}
    </bdi>
  );
}
