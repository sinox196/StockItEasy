'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

/**
 * Chart palette (validated for CVD separation and contrast in both themes):
 * series 1 = blue, series 2 = amber. Single-series charts use series 1.
 */
function useChartTheme() {
  const { theme } = useTheme();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, [theme]);
  return dark
    ? { s1: '#3B82F6', s2: '#D97706', grid: '#1E293B', axis: '#94A3B8', surface: '#0F172A', text: '#F8FAFC' }
    : { s1: '#2563EB', s2: '#D97706', grid: '#EEF2F7', axis: '#64748B', surface: '#FFFFFF', text: '#0F172A' };
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <bdi dir="ltr" className="num font-semibold text-foreground">{format(p.value)}</bdi>
        </p>
      ))}
    </div>
  );
}

/** Each chart offers a table view so values are never conveyed by color or shape alone. */
function WithTable({ children, rows, headers }: { children: ReactNode; rows: (string | number)[][]; headers: string[] }) {
  const { t } = useI18n();
  return (
    <div>
      {children}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">{t('common.details')}</summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className="w-full">
            <thead>
              <tr>{headers.map((h) => <th key={h} className="py-1 text-start font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="py-0.5"><bdi dir="ltr" className="num">{c}</bdi></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const shortDay = (d: string) => d.slice(5).split('-').reverse().join('/');

export function SalesAreaChart({ data }: { data: { day: string; revenue: number }[] }) {
  const c = useChartTheme();
  const { t, money, dir } = useI18n();
  return (
    <WithTable headers={[t('common.date'), t('dashboard.revenue')]} rows={data.map((d) => [d.day, money(d.revenue)])}>
      <div className="h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.s1} stopOpacity={0.25} />
                <stop offset="100%" stopColor={c.s1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} reversed={dir === 'rtl'} minTickGap={16} />
            <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={48} orientation={dir === 'rtl' ? 'right' : 'left'} />
            <Tooltip content={<ChartTooltip format={(v) => money(v)} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="revenue" name={t('dashboard.revenue')} stroke={c.s1} strokeWidth={2} fill="url(#salesFill)" activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </WithTable>
  );
}

export function MovementsBarChart({ data }: { data: { day: string; inbound: number; outbound: number }[] }) {
  const c = useChartTheme();
  const { t, num, dir } = useI18n();
  return (
    <WithTable headers={[t('common.date'), t('dashboard.inbound'), t('dashboard.outbound')]} rows={data.map((d) => [d.day, num(d.inbound), num(d.outbound)])}>
      <div className="h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} reversed={dir === 'rtl'} minTickGap={16} />
            <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} orientation={dir === 'rtl' ? 'right' : 'left'} />
            <Tooltip content={<ChartTooltip format={(v) => num(v)} />} cursor={{ fill: c.grid }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: c.axis }} />
            <Bar dataKey="inbound" name={t('dashboard.inbound')} fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="outbound" name={t('dashboard.outbound')} fill={c.s2} radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WithTable>
  );
}

/** Horizontal ranked bars for a single measure (top products, value by category/warehouse). */
export function RankedBars({ data, valueLabel, format }: { data: { label: string; value: number }[]; valueLabel: string; format: (v: number) => string }) {
  const c = useChartTheme();
  const { t, dir } = useI18n();
  const height = Math.max(160, data.length * 34 + 20);
  return (
    <WithTable headers={[t('common.name'), valueLabel]} rows={data.map((d) => [d.label, format(d.value)])}>
      <div style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={c.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} reversed={dir === 'rtl'} />
            <YAxis type="category" dataKey="label" width={130} tick={{ fill: c.text, fontSize: 12 }} axisLine={false} tickLine={false} orientation={dir === 'rtl' ? 'right' : 'left'} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: c.grid }} />
            <Bar dataKey="value" name={valueLabel} fill={c.s1} radius={dir === 'rtl' ? [4, 0, 0, 4] : [0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WithTable>
  );
}
