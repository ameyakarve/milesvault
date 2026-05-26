'use client'

import { NotePencil } from '@phosphor-icons/react/dist/ssr'

export function NavRail() {
  return (
    <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[48px] h-screen shrink-0">
      <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-[6px] text-white font-black text-lg">
        M
      </div>
      <div className="flex flex-col gap-4">
        <div
          aria-label="Editor"
          title="Editor"
          className="p-2 text-teal-500"
        >
          <NotePencil size={24} weight="regular" />
        </div>
      </div>
    </nav>
  )
}
