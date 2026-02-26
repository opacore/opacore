import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [],
  theme: {
    extend: {
      colors: {
        bitcoin: {
          DEFAULT: '#F7931A',
          50: '#FEF3E2',
          100: '#FDE7C5',
          200: '#FBCF8B',
          300: '#FAB751',
          400: '#F89F17',
          500: '#F7931A',
          600: '#D47A0E',
          700: '#A15D0B',
          800: '#6E3F07',
          900: '#3B2204',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
