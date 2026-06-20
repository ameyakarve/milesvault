'use client'

import { SectionLabel } from '@/components/shared'
import { ThemeToggle } from '../_chrome/theme-toggle'

// Settings home — intentionally small to begin with: account, appearance, and
// the build version (moved off the nav rail). Grows from here.
export function SettingsView({ email }: { email: string | null }) {
  const build = (process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev').slice(0, 7)
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <section className="space-y-3">
        <SectionLabel>Account</SectionLabel>
        <Row label="Signed in as" value={email ?? '—'} />
      </section>

      <section className="space-y-3">
        <SectionLabel>Appearance</SectionLabel>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm text-foreground">Theme</span>
          <ThemeToggle className="rounded-lg p-2 text-muted-foreground hover:text-foreground" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>About</SectionLabel>
        <Row label="Build" value={build} mono />
      </section>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className={`text-sm text-muted-foreground ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}
