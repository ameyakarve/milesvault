import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ThinkPlayground } from './think'

export default async function ThinkPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/think')
  return <ThinkPlayground email={session.user.email} />
}
