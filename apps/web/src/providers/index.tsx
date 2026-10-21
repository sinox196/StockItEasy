'use client';

import type { AppLocale } from '@stockiteasy/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';
import { AuthProvider } from './auth';
import { I18nProvider } from './i18n';
import { ThemeChoice, ThemeProvider } from './theme';

export function Providers({ locale, theme, children }: { locale: AppLocale; theme: ThemeChoice; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <ThemeProvider initialTheme={theme}>
      <I18nProvider initialLocale={locale}>
        <QueryClientProvider client={client}>
          <AuthProvider>{children}</AuthProvider>
          <Toaster richColors position="top-center" closeButton dir={locale === 'ar-TN' ? 'rtl' : 'ltr'} />
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
