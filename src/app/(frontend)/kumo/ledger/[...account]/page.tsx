import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PerAccountView } from '../../../ledger/per-account-view'

export default async function KumoLedgerAccountPage({
  params,
}: {
  params: Promise<{ account: string[] }>
}) {
  const [{ account: segments }, session] = await Promise.all([params, auth()])
  if (!session?.user) {
    redirect(`/login?callbackUrl=/kumo/ledger/${segments.join('/')}`)
  }
  const account = segments.join(':')
  return <PerAccountView account={account} />
}
