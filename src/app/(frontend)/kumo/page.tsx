import { auth } from '@/auth'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import { LinkButton } from '@cloudflare/kumo/components/button'
import {
  House,
  Books,
  SignIn,
  ListBullets,
} from '@phosphor-icons/react/dist/ssr'

const ROUTES = [
  {
    href: '/kumo/home',
    label: 'Home',
    description: 'Landing chrome with sidebar nav.',
    icon: House,
  },
  {
    href: '/kumo/ledger',
    label: 'Accounts directory',
    description: 'Search, filter, and browse all accounts.',
    icon: Books,
  },
  {
    href: '/kumo/ledger/Assets:Bank:HDFC',
    label: 'Per-account view',
    description: 'Overview, statement, and editor tabs for a single account.',
    icon: ListBullets,
  },
  {
    href: '/kumo/login',
    label: 'Login',
    description: 'Google OAuth sign-in.',
    icon: SignIn,
  },
] as const

export default async function KumoIndex() {
  const session = await auth()

  return (
    <main className="min-h-screen bg-kumo-recessed px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-kumo-default">
            MilesVault — Kumo preview
          </h1>
          <p className="text-sm text-kumo-subtle">
            Parallel UI rendered with{' '}
            <code className="rounded bg-kumo-base px-1.5 py-0.5 text-xs ring ring-kumo-hairline">
              @cloudflare/kumo
            </code>
            . Sign in once at{' '}
            <a className="text-kumo-brand hover:underline" href="/login">
              /login
            </a>{' '}
            to view authenticated routes.
            {session?.user && (
              <span className="ml-1 text-kumo-default">
                Signed in as <strong>{session.user.email}</strong>.
              </span>
            )}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {ROUTES.map((route) => {
            const Icon = route.icon
            return (
              <LayerCard
                key={route.href}
                className="flex flex-col gap-3 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-md bg-kumo-tint p-2 text-kumo-brand">
                    <Icon size={18} weight="duotone" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-kumo-default">
                      {route.label}
                    </div>
                    <div className="text-xs text-kumo-subtle">
                      {route.description}
                    </div>
                  </div>
                </div>
                <LinkButton
                  href={route.href}
                  variant="secondary"
                  size="sm"
                  className="self-start"
                >
                  Open {route.label.toLowerCase()}
                </LinkButton>
              </LayerCard>
            )
          })}
        </div>
      </div>
    </main>
  )
}
