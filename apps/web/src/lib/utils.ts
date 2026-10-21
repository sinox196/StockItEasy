import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

const ADJUSTMENT_REASON_SET = new Set(['DAMAGED', 'EXPIRED', 'LOST', 'THEFT_SUSPECTED', 'FOUND', 'CORRECTION', 'INTERNAL_USE', 'SAMPLE', 'OTHER']);

/** Coded reasons are translated; free-text reasons (e.g. customer returns) are shown as typed. */
export function reasonLabel(t: (k: string) => string, reason: string | null | undefined) {
  if (!reason) return null;
  return ADJUSTMENT_REASON_SET.has(reason) ? t(`movements.reasons.${reason}`) : reason;
}
