import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/inbox')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa]">
      <NavRail />
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-slate-500 text-sm max-w-xs">
          Nothing to review. Captured statements and forwarded emails will queue here.
        </p>
      </main>
    </div>
  )
}
