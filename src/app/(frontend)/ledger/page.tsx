import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LedgerView } from './ledger-view'

export default async function LedgerPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/ledger')
  return <LedgerView email={session.user.email} />
}
