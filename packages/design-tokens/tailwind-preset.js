/**
 * Tailwind preset consumed by apps/web. Colors resolve to CSS variables so
 * light/dark themes switch without rebuilding.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: v('background'),
        surface: v('surface'),
        muted: v('surface-muted'),
        border: v('border'),
        foreground: v('text'),
        'muted-foreground': v('text-muted'),
        primary: { DEFAULT: v('primary'), foreground: v('primary-text') },
        secondary: { DEFAULT: v('secondary'), foreground: v('secondary-text') },
        accent: { DEFAULT: v('accent'), foreground: v('accent-text') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        navy: { 900: '#0F172A', 800: '#1E293B' },
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '20px' },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-arabic)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-inter)', 'sans-serif'],
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px rgb(15 23 42 / 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in 180ms ease-out' },
    },
  },
};
