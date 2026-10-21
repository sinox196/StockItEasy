/**
 * StockItEasy design tokens — single source for web (Tailwind preset) and mobile (React Native).
 * Palette: Deep Navy / Electric Blue / Emerald, aligned with the StockItEasy logo.
 */

export const palette = {
  navy: { 950: '#020617', 900: '#0F172A', 800: '#1E293B', 700: '#334155', 600: '#475569', 500: '#64748B', 400: '#94A3B8', 300: '#CBD5E1', 200: '#E2E8F0', 100: '#F1F5F9', 50: '#F8FAFC' },
  blue: { 700: '#1D4ED8', 600: '#2563EB', 500: '#3B82F6', 400: '#60A5FA', 100: '#DBEAFE', 50: '#EFF6FF' },
  emerald: { 700: '#047857', 600: '#059669', 500: '#10B981', 400: '#34D399', 100: '#D1FAE5', 50: '#ECFDF5' },
  amber: { 700: '#B45309', 500: '#F59E0B', 100: '#FEF3C7', 50: '#FFFBEB' },
  red: { 700: '#B91C1C', 500: '#EF4444', 100: '#FEE2E2', 50: '#FEF2F2' },
  white: '#FFFFFF',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  secondary: string;
  secondaryText: string;
  accent: string;
  accentText: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
}

export const lightColors: ThemeColors = {
  background: palette.navy[50],
  surface: palette.white,
  surfaceMuted: palette.navy[100],
  border: palette.navy[200],
  text: palette.navy[900],
  textMuted: palette.navy[500],
  primary: palette.navy[900],
  primaryText: palette.white,
  secondary: palette.blue[600],
  secondaryText: palette.white,
  accent: palette.emerald[500],
  accentText: '#022C22',
  warning: palette.amber[500],
  warningSoft: palette.amber[50],
  danger: palette.red[500],
  dangerSoft: palette.red[50],
  success: palette.emerald[600],
  successSoft: palette.emerald[50],
  info: palette.blue[600],
  infoSoft: palette.blue[50],
};

export const darkColors: ThemeColors = {
  background: palette.navy[950],
  surface: palette.navy[900],
  surfaceMuted: palette.navy[800],
  border: palette.navy[700],
  text: palette.navy[50],
  textMuted: palette.navy[400],
  primary: palette.blue[500],
  primaryText: palette.white,
  secondary: palette.blue[500],
  secondaryText: palette.white,
  accent: palette.emerald[400],
  accentText: '#022C22',
  warning: palette.amber[500],
  warningSoft: '#3A2A06',
  danger: palette.red[500],
  dangerSoft: '#3B1111',
  success: palette.emerald[400],
  successSoft: '#06281D',
  info: palette.blue[400],
  infoSoft: '#0B1E3F',
};

export const radii = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const fontFamilies = {
  latin: 'Inter',
  arabic: 'IBM Plex Sans Arabic',
} as const;
export const fontSizes = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 36 } as const;
/** Minimum touch target (POS, mobile). */
export const touchTarget = 48;
