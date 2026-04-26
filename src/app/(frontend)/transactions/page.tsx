import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { TransactionsView } from './transactions-view'

export default async function TransactionsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/transactions')
  return <TransactionsView />
}
