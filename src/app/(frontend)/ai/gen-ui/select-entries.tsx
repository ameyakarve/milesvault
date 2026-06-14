'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { SelectEntriesInput } from '@/durable/agent-ui-schemas'

export type SelectEntriesCardStatus = 'idle' | 'done' | 'rejected'

export type SelectEntriesCardProps = {
  input: SelectEntriesInput
  status?: SelectEntriesCardStatus
  // The ids the user ticked (echoed back when resolved, for the closed state).
  resolvedIds?: number[]
  onSelect: (ids: number[]) => void
  onReject: () => void
}

// >10-match picker for the edit/delete flow: the model hands us { id, title }
// candidates from its query_sql rows; the user ticks which to act on; we resolve
// to the chosen ids and the model get_entry's + drafts each.
export function SelectEntriesCard({
  input,
  status = 'idle',
  resolvedIds,
  onSelect,
  onReject,
}: SelectEntriesCardProps) {
  const done = status === 'done'
  const rejected = status === 'rejected'
  const disabled = done || rejected
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const toggle = (id: number) => {
    if (disabled) return
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allOn = input.candidates.every((c) => picked.has(c.id))
  const toggleAll = () =>
    setPicked(allOn ? new Set() : new Set(input.candidates.map((c) => c.id)))

  if (done) {
    const n = resolvedIds?.length ?? picked.size
    return (
      <Card size="sm">
        <CardContent className="py-2.5 text-sm text-muted-foreground">
          Selected {n} entr{n === 1 ? 'y' : 'ies'}.
        </CardContent>
      </Card>
    )
  }
  if (rejected) {
    return (
      <Card size="sm">
        <CardContent className="py-2.5 text-sm italic text-muted-foreground">Dismissed</CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {input.prompt ?? 'Which entries?'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {picked.size} of {input.candidates.length} selected
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-72 divide-y divide-border overflow-y-auto border-y">
          {input.candidates.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={() => toggle(c.id)}
                className="size-3.5 accent-foreground"
              />
              <span className="truncate text-[12px] text-foreground/80">{c.title}</span>
            </label>
          ))}
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="justify-between">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onReject}>
            Dismiss
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
            {allOn ? 'Clear all' : 'Select all'}
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onSelect([...picked])}
          disabled={picked.size === 0}
        >
          Use {picked.size} selected
        </Button>
      </CardFooter>
    </Card>
  )
}
