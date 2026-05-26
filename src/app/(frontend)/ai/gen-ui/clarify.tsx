'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { ClarifyInput } from '@/durable/agent-ui-schemas'

export type ClarifyCardStatus = 'idle' | 'done' | 'rejected'

export type ClarifyCardProps = {
  input: ClarifyInput
  status?: ClarifyCardStatus
  // Final selected answers, in the order the user picked them.
  resolvedAnswers?: string[]
  onAnswer: (answers: string[]) => void
  onReject: () => void
}

export function ClarifyCard({
  input,
  status = 'idle',
  resolvedAnswers,
  onAnswer,
  onReject,
}: ClarifyCardProps) {
  const multi = input.multi_select ?? false
  const allowCustom = input.allow_custom ?? true
  const [selected, setSelected] = useState<string[]>([])
  const [custom, setCustom] = useState('')

  const done = status === 'done'
  const rejected = status === 'rejected'
  const disabled = done || rejected

  function toggle(opt: string) {
    if (disabled) return
    if (multi) {
      setSelected((prev) =>
        prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
      )
      return
    }
    // Single-select: clicking an option commits immediately. Anything the
    // user typed in the custom field is ignored — the chip click is the
    // explicit answer.
    onAnswer([opt])
  }

  function submit() {
    const trimmedCustom = custom.trim()
    const final: string[] = [...selected]
    if (trimmedCustom) final.push(trimmedCustom)
    if (final.length === 0) return
    onAnswer(final)
  }

  const canSubmit = selected.length > 0 || custom.trim().length > 0

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-normal">{input.question}</CardTitle>
      </CardHeader>

      {done && resolvedAnswers && resolvedAnswers.length > 0 ? (
        <CardContent className="flex flex-wrap gap-1.5">
          {resolvedAnswers.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-sm"
            >
              {a}
            </span>
          ))}
        </CardContent>
      ) : (
        <>
          {input.options.length > 0 ? (
            <CardContent className="flex flex-wrap gap-1.5">
              {input.options.map((opt) => {
                const on = selected.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    disabled={disabled}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-sm transition-colors disabled:opacity-50',
                      on
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {opt}
                  </button>
                )
              })}
            </CardContent>
          ) : null}

          {allowCustom ? (
            <CardContent className={input.options.length > 0 ? 'pt-0' : undefined}>
              <Input
                type="text"
                value={custom}
                placeholder={
                  input.options.length > 0
                    ? 'Or type your own…'
                    : 'Type your answer…'
                }
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) {
                    e.preventDefault()
                    submit()
                  }
                }}
                disabled={disabled}
              />
            </CardContent>
          ) : null}
        </>
      )}

      {rejected ? (
        <>
          <Separator />
          <CardContent className="text-sm text-muted-foreground italic">
            Dismissed
          </CardContent>
        </>
      ) : null}

      {done || rejected ? null : (
        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onReject}>
            Dismiss
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
            {multi ? 'Send answers' : 'Send answer'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
