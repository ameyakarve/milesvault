import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PointsView } from './points-view'

export const dynamic = 'force-dynamic'

export default async function PointsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/points')

  return <PointsView />
}
