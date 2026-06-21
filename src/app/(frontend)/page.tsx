import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { GoogleSignIn } from './_chrome/google-sign-in'

export const metadata = {
  title: 'MilesVault — your cards, points & miles in one ledger',
  description:
    'MilesVault turns your credit-card and bank statements into a private, reviewable ledger — tracking what you owe, where you spend, and the reward points and miles you earn.',
}

// Public landing — the homepage. Must explain the app and be viewable without
// signing in (Google OAuth verification requires both). Signed-in users skip
// straight to their vault.
export default async function HomePage() {
  const session = await auth()
  if (session?.user) redirect('/vault')

  const features: Array<{ title: string; body: string }> = [
    {
      title: 'Statements → ledger, automatically',
      body: 'Forward a card statement or a transaction email, or drop in a PDF. MilesVault reads it and drafts clean, categorised entries for you to review and approve.',
    },
    {
      title: 'See what you actually owe',
      body: 'Your outstanding balance across every card — even across currencies — plus where your money went this month, with trends.',
    },
    {
      title: 'Never lose a point',
      body: 'Reward points and miles tracked properly, including the ones still pending until your statement posts them.',
    },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-5 py-16 sm:py-24">
        {/* brand */}
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">MilesVault</span>
        </span>

        {/* purpose */}
        <h1 className="mt-12 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your cards, points, and miles — finally in one ledger.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          MilesVault turns your credit-card and bank statements into a private, reviewable ledger.
          It reads what you upload or forward, drafts the entries, and shows you what you owe across
          every card, where you&rsquo;re spending, and the reward points and miles you&rsquo;ve
          earned. It&rsquo;s currently an invite-only beta.
        </p>

        {/* sign in */}
        <div className="mt-8 w-full max-w-[320px]">
          <GoogleSignIn />
          <p className="mt-2 text-xs text-muted-foreground">Invite-only — sign in to continue.</p>
        </div>

        {/* what it does */}
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title}>
              <h2 className="text-sm font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        {/* footer */}
        <footer className="mt-20 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
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
