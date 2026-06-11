import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'
import containerQueries from '@tailwindcss/container-queries'


// Theme tokens hold COMPLETE colors (oklch(...)) in CSS vars, so Tailwind's
// <alpha-value> can't compose with them — every `token/NN` opacity modifier
// silently compiled to NOTHING, and `ring-1` (et al) fell back to Tailwind's
// default BLUE ring. This function makes opacity modifiers real via
// color-mix, app-wide.
function tokenColor(cssVar: string): string {
  // Function color values are supported by Tailwind v3 at runtime but not in
  // its TS types — hence the cast.
  return (({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined || opacityValue === '1'
      ? `var(${cssVar})`
      : `color-mix(in oklab, var(${cssVar}) calc(${opacityValue} * 100%), transparent)`) as unknown as string
}

const config: Config = {
  content: [
    './src/app/(frontend)/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        border: tokenColor('--border'),
        input: tokenColor('--input'),
        ring: tokenColor('--ring'),
        background: tokenColor('--background'),
        foreground: tokenColor('--foreground'),
        primary: {
          DEFAULT: tokenColor('--primary'),
          foreground: tokenColor('--primary-foreground'),
        },
        secondary: {
          DEFAULT: tokenColor('--secondary'),
          foreground: tokenColor('--secondary-foreground'),
        },
        destructive: {
          DEFAULT: tokenColor('--destructive'),
          foreground: 'var(--destructive-foreground, oklch(0.985 0 0))',
        },
        muted: {
          DEFAULT: tokenColor('--muted'),
          foreground: tokenColor('--muted-foreground'),
        },
        accent: {
          DEFAULT: tokenColor('--accent'),
          foreground: tokenColor('--accent-foreground'),
        },
        popover: {
          DEFAULT: tokenColor('--popover'),
          foreground: tokenColor('--popover-foreground'),
        },
        card: {
          DEFAULT: tokenColor('--card'),
          foreground: tokenColor('--card-foreground'),
        },
        sidebar: {
          DEFAULT: tokenColor('--sidebar'),
          foreground: tokenColor('--sidebar-foreground'),
          primary: tokenColor('--sidebar-primary'),
          'primary-foreground': tokenColor('--sidebar-primary-foreground'),
          accent: tokenColor('--sidebar-accent'),
          'accent-foreground': tokenColor('--sidebar-accent-foreground'),
          border: tokenColor('--sidebar-border'),
          ring: tokenColor('--sidebar-ring'),
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [forms, containerQueries],
}

export default config
