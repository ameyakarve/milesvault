import { auth } from '@/auth'
import { LedgerView } from './ledger-view'

export default async function LedgerPage() {
  const session = await auth()
  const email = session!.user!.email!
  return <LedgerView txns={[]} email={email} />
}
