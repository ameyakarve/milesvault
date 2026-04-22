import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'
import containerQueries from '@tailwindcss/container-queries'

const config: Config = {
  content: ['./src/app/(frontend)/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#0A2540',
        ink: '#0A1628',
        muted: '#6B7889',
        'slate-bg': '#E5ECF5',
        'mint-bg': '#DDEAE2',
        'plum-bg': '#ECE5EA',
        'saffron-bg': '#F0E9DC',
        'chip-bg': '#EEF2F7',
        'hover-row': '#F4F6F9',
        scandi: {
          bg: '#F1F5F9',
          content: '#FFFFFF',
          border: '#E2E8F0',
          'border-muted': '#CBD5E1',
          'text-primary': '#1E293B',
          'text-secondary': '#64748B',
          'text-muted': '#94A3B8',
          chrome: '#DCE3EB',
          cap: '#ECF1F6',
          surface: '#E8EDF2',
          quiet: '#EEF2F6',
          rule: '#C5CEDA',
          backdrop: '#BBC6D3',
          accent: '#2F5D7A',
          'accent-hover': '#224866',
        },
        navy: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          600: '#1E293B',
          700: '#0F172A',
          900: '#020617',
        },
        sky: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          600: '#0284C7',
          700: '#0369A1',
        },
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          900: '#0F172A',
        },
        error: '#EF4444',
      },
      fontFamily: {
        serif: ['Fraunces', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [forms, containerQueries],
}

export default config
