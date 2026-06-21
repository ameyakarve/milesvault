import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NavRail } from '../_chrome/nav-rail'
import { ConciergeChat } from './chat'
import { conciergeEnabled } from '@/lib/flags'

export default async function ConciergePage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/concierge')

  // Concierge kill switch — off for non-admins; bounce them home.
  const { env } = await getCloudflareContext({ async: true })
  if (!(await conciergeEnabled(env as Cloudflare.Env, { email: session.user.email }))) {
    redirect('/vault')
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex flex-1 flex-col">
        <ConciergeChat />
      </main>
    </div>
  )
}
