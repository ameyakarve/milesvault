import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NavRail } from '../_chrome/nav-rail'
import { StatusBar } from '../_chrome/status-bar'
import { EditorShell } from './editor-shell'

export default async function EditorPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/editor')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#fbfbfa] pb-[28px]">
      <NavRail />
      <main className="flex flex-1 flex-col">
        <EditorShell />
      </main>
      <StatusBar />
    </div>
  )
}
