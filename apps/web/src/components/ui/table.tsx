import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}
export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} className={cn('bg-muted/60', p.className)} />;
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} className={cn('divide-y divide-border', p.className)} />;
export const Tr = (p: HTMLAttributes<HTMLTableRowElement>) => <tr {...p} className={cn('transition-colors hover:bg-muted/40', p.className)} />;
export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...p} />
);
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;
