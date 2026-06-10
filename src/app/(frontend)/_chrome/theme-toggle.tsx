'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

// Light/dark toggle. The pre-paint script in layout.tsx applies the stored
// (or system) preference before hydration; this just flips and persists it.
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      /* private mode */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={className ?? 'p-2 text-muted-foreground hover:text-foreground'}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
