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
