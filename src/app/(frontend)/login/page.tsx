import { signIn } from '@/auth'

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await props.searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#FBFCFD]">
      <div className="bg-white border border-[#E4E8ED] rounded-lg p-8 w-full max-w-[360px] space-y-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">MilesVault</h1>
          <p className="text-sm text-muted">Sign in to continue</p>
        </div>
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: callbackUrl || '/ledger' })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 border border-[#D8DEE5] rounded-md py-2.5 text-[0.9rem] font-medium text-ink hover:bg-[#F4F6F9] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z" fill="#34A853"/>
              <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18a10.99 10.99 0 0 0 0 9.87l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.1 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  )
}
