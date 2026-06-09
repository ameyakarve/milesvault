import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ExploreView } from './explore-view'

export const dynamic = 'force-dynamic'

export default async function ExplorePage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/explore')

  return <ExploreView />
}
