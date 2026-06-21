import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { GoogleSignIn } from './_chrome/google-sign-in'

export const metadata = {
  title: 'MilesVault — track & optimise your card points and airline miles',
  description:
    'MilesVault tracks every reward point and mile your cards earn — across all your loyalty programmes, earned and still-pending — so you can optimise your rewards and never let miles expire.',
}

// Public landing — the homepage. Must explain the app and be viewable without
// signing in (Google OAuth verification requires both). Signed-in users skip
// straight to their vault.
export default async function HomePage() {
  const session = await auth()
  if (session?.user) redirect('/vault')

  const features: Array<{ title: string; body: string }> = [
    {
      title: 'Capture every point & mile',
      body: 'Points and miles are pulled from each statement automatically — both earned and still-pending — so nothing slips through the cracks.',
    },
    {
      title: 'All your programmes, one place',
      body: 'Airline miles, hotel points, and card rewards across every loyalty programme, with up-to-date balances and status.',
    },
    {
      title: 'Earn and redeem smarter',
      body: 'See which card earns the most where, keep balances current so nothing quietly expires, and know what each point is worth.',
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
          Track every point and mile your cards earn.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          MilesVault reads your credit-card statements and builds a rewards ledger — tracking the
          points and miles you earn on every card (including the ones still pending), your balances
          across airline and hotel programmes, and which spend earns where, so you can optimise your
          rewards and never let miles expire. It keeps tabs on what you owe and where you spend, too.
          It&rsquo;s currently an invite-only beta.
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
