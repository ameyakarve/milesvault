import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ExpensesView } from './expenses-view'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/expenses')

  return <ExpensesView />
}
