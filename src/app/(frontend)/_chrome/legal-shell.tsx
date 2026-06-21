import Link from 'next/link'
import type { ReactNode } from 'react'

// Public legal-page chrome (privacy / terms). Server component, no auth — these
// must be reachable without signing in (Google's OAuth verification links them).
// Prose styling is applied via descendant selectors so we don't need a plugin.
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">MilesVault</span>
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-xs text-muted-foreground">Last updated: {updated}</p>

        <article
          className={[
            'mt-8 text-sm leading-relaxed text-muted-foreground',
            '[&_h2]:mt-9 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground',
            '[&_p]:mt-3',
            '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
            '[&_li]:marker:text-muted-foreground/50',
            '[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2',
            '[&_strong]:font-medium [&_strong]:text-foreground',
          ].join(' ')}
        >
          {children}
        </article>

        <footer className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href="mailto:support@milesvault.com" className="hover:text-foreground">
            support@milesvault.com
          </a>
          <span className="ml-auto">© 2026 MilesVault</span>
        </footer>
      </div>
    </main>
  )
}
