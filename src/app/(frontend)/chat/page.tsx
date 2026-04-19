import { auth } from '@/auth'
import { Chat } from './chat'

export default async function ChatPage() {
  const session = await auth()
  const email = session!.user!.email!
  return <Chat email={email} />
}
