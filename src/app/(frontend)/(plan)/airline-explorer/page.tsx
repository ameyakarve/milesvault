import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AirlineExplorerView } from './airline-explorer-view'

export const dynamic = 'force-dynamic'

export default async function AirlineExplorerPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/airline-explorer')

  return <AirlineExplorerView />
}
