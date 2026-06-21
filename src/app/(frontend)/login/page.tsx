import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { SignInButton } from '../_chrome/sign-in-button'

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await props.searchParams

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Card className="w-full max-w-[380px]">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="size-6" />
              <h1 className="text-xl font-semibold tracking-tight">MilesVault</h1>
            </span>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
          <SignInButton redirectTo={callbackUrl || '/vault'} />
        </CardContent>
      </Card>
      <p className="max-w-[380px] text-center text-xs text-muted-foreground">
        By continuing you agree to our{' '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  )
}
