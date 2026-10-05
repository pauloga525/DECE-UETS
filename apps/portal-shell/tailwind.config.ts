import type { Config } from 'tailwindcss';

// Sistema de diseño — sección 9.1 del plan: un solo acento institucional +
// colores de estado reservados para badges (nunca decoración).
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f8f7',
        surface: '#ffffff',
        ink: '#141a17',
        'ink-soft': '#5b665f',
        line: '#e2e5e1',
        accent: { DEFAULT: '#1f6f5c', ink: '#123f34', tint: '#e4efec' },
        status: {
          scheduled: '#3a6ea8',
          'scheduled-tint': '#e8eff8',
          warning: '#b5750c',
          'warning-tint': '#faf1e0',
          danger: '#a83f3f',
          'danger-tint': '#f8e9e9',
          inactive: '#6b7681',
          'inactive-tint': '#eef0f1',
          waitlist: '#7a5aa8',
          'waitlist-tint': '#f0ecf6',
        },
      },
      fontFamily: {
        heading: ['var(--font-sora)', 'system-ui', 'sans-serif'],
        body: ['var(--font-public-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(20, 26, 23, 0.06)',
      },
    },
  },
  plugins: [],
};
export default config;
