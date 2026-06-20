import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { SectionLabel } from '@/components/shared'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/profile')
  const { email, name, image } = session.user
  const initial = (name ?? email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-8">
          <h1 className="text-lg font-semibold tracking-tight">Profile</h1>

          <section className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="size-12 rounded-full" />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              {name ? <p className="truncate text-sm font-medium text-foreground">{name}</p> : null}
              <p className="truncate text-sm text-muted-foreground">{email ?? '—'}</p>
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Session</SectionLabel>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
