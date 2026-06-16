import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { CaptureReview } from '../inbox/capture-review'

export const dynamic = 'force-dynamic'

export default async function StatementsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/statements')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <NavRail />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <CaptureReview source="upload" />
      </main>
    </div>
  )
}
