import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ChatClient } from './chat-client'
import './chat.css'

export default async function ChatPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login?callbackUrl=/chat')
  return <ChatClient userEmail={session.user.email} />
}
