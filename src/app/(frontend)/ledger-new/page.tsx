import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LedgerNewView } from './ledger-new-view'

export default async function LedgerNewPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/ledger-new')
  return <LedgerNewView email={session.user.email} />
}
