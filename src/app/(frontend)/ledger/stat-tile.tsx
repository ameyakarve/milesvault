import React from 'react'

export type StatTileChip = { text: string; tone: 'pos' | 'neg' }

export type StatTileProps = {
  label: string
  value: string
  valueClass?: string
  chip?: StatTileChip
  caption?: string
}

export function StatTile({ label, value, valueClass, chip, caption }: StatTileProps) {
  return (
    <div className="bg-white border border-slate-100 rounded-md p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">
        {label}
      </div>
      <div className="flex items-baseline space-x-2">
        <span className={`font-mono text-xl font-bold ${valueClass ?? 'text-slate-900'}`}>
          {value}
        </span>
        {chip && (
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              chip.tone === 'pos'
                ? 'bg-[#00685f]/10 text-[#00685f]'
                : 'bg-rose-600/10 text-rose-600'
            }`}
          >
            {chip.text}
          </span>
        )}
      </div>
      {caption && (
        <div className="text-[10px] text-slate-400 mt-1 italic">{caption}</div>
      )}
    </div>
  )
}
