import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AccountsView } from './accounts-view'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/accounts')

  return <AccountsView />
}
