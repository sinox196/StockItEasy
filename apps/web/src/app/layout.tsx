import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './globals.css';
import { direction, isSupportedLocale } from '@stockiteasy/i18n';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { ReactNode } from 'react';
import { Providers } from '@/providers';
import { LOCALE_COOKIE } from '@/providers/i18n';
import { THEME_COOKIE, ThemeChoice, themeScript } from '@/providers/theme';

export const metadata: Metadata = {
  title: { default: 'StockItEasy', template: '%s · StockItEasy' },
  description: 'Gestion de stock intelligente — Web, Android & iOS',
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

/** Locale and theme are resolved on the server from cookies so the first paint already has the right lang/dir. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const c = await cookies();
  const cookieLocale = c.get(LOCALE_COOKIE)?.value;
  // French is the default on first launch; the user's choice is kept in a cookie and in their profile.
  const locale = isSupportedLocale(cookieLocale) ? cookieLocale : 'fr-TN';
  const themeValue = c.get(THEME_COOKIE)?.value;
  const theme: ThemeChoice = themeValue === 'dark' || themeValue === 'light' ? themeValue : 'system';
  return (
    <html lang={locale} dir={direction(locale)} className={theme === 'dark' ? 'dark' : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers locale={locale} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
