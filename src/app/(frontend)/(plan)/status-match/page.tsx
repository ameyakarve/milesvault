import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { StatusMatchView } from './status-match-view'

export const dynamic = 'force-dynamic'

export default async function StatusMatchPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/status-match')

  return <StatusMatchView />
}
