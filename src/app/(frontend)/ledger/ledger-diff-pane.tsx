'use client'

import { useMemo } from 'react'
import { diffLines } from 'diff'

type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }
type Hunk = { header: string; lines: DiffLine[] }

const DIFF_CONTEXT = 2

function computeHunks(baseline: string, current: string): Hunk[] {
  if (baseline === current) return []
  const parts = diffLines(baseline, current)
  const flat: DiffLine[] = []
  for (const p of parts) {
    const kind: DiffLine['kind'] = p.added ? 'add' : p.removed ? 'del' : 'ctx'
    const body = p.value.endsWith('\n') ? p.value.slice(0, -1) : p.value
    const lines = body.length === 0 ? [''] : body.split('\n')
    for (const l of lines) flat.push({ kind, text: l })
  }
  const changeIdx: number[] = []
  for (let i = 0; i < flat.length; i++) if (flat[i].kind !== 'ctx') changeIdx.push(i)
  const hunks: Hunk[] = []
  let i = 0
  while (i < changeIdx.length) {
    const start = Math.max(0, changeIdx[i] - DIFF_CONTEXT)
    let end = changeIdx[i]
    let j = i
    while (j + 1 < changeIdx.length && changeIdx[j + 1] - end <= DIFF_CONTEXT * 2) {
      j++
      end = changeIdx[j]
    }
    end = Math.min(flat.length - 1, end + DIFF_CONTEXT)
    const slice = flat.slice(start, end + 1)
    const firstChange = slice.find((l) => l.kind !== 'ctx')
    const ctx = slice.find((l) => l.kind === 'ctx' && l.text.trim().length > 0)
    const header = makeHunkTitle(firstChange?.text ?? '', ctx?.text ?? '')
    hunks.push({ header, lines: slice })
    i = j + 1
  }
  return hunks
}

function makeHunkTitle(changeLine: string, ctxLine: string): string {
  const txnLine = /^\d{4}-\d{2}-\d{2}/.test(ctxLine) ? ctxLine : changeLine
  const m = txnLine.match(/^\d{4}-\d{2}-\d{2}\s+[*!]\s+(?:"([^"]*)")?(?:\s+"([^"]*)")?/)
  if (m) {
    const bits = [m[1]?.trim(), m[2]?.trim()].filter(Boolean)
    if (bits.length > 0) return bits.join(' · ').toLowerCase()
  }
  return 'change'
}

export function DiffPane({ baseline, current }: { baseline: string; current: string }) {
  const hunks = useMemo(() => computeHunks(baseline, current), [baseline, current])
  const fileTitle = hunks[0]?.header ?? null

  return (
    <>
      <div className="h-[24px] px-[12px] flex items-center bg-[#F0F9FF] border-b border-[#E0F2FE] shrink-0">
        <span className="font-mono text-[11px] font-medium text-[#0F172A]">
          {fileTitle ?? 'no pending changes'}
        </span>
      </div>
      {hunks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 font-mono">
          buffer matches baseline
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 text-[11px] font-mono">
          {hunks.map((h, idx) => (
            <div key={idx} className={`${idx < hunks.length - 1 ? 'mb-4' : ''} group relative`}>
              {idx > 0 && (
                <div className="text-slate-500 text-[10px] uppercase tracking-wider py-0.5">
                  {h.header}
                </div>
              )}
              {h.lines.map((line, li) => {
                if (line.kind === 'add') {
                  return (
                    <div
                      key={li}
                      className="bg-emerald-50 text-emerald-700 flex px-2 py-0.5 border-l-[2px] border-emerald-600"
                    >
                      <span className="w-4 shrink-0 select-none font-medium">+</span>
                      <span className="whitespace-pre">{line.text}</span>
                    </div>
                  )
                }
                if (line.kind === 'del') {
                  return (
                    <div
                      key={li}
                      className="bg-red-50 text-red-500 flex px-2 py-0.5 border-l-[2px] border-red-500 line-through"
                    >
                      <span className="w-4 shrink-0 select-none">-</span>
                      <span className="whitespace-pre">{line.text}</span>
                    </div>
                  )
                }
                return (
                  <div key={li} className="text-slate-400 flex px-2 py-0.5">
                    <span className="w-4 shrink-0 select-none"> </span>
                    <span className="whitespace-pre">{line.text}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
