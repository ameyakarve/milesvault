'use client'

import { ArrowRight, Plane } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ShowAwardOptionsInput } from '@/durable/agent-ui-schemas'

// The chat answer to "best way to fly X→Y with <card>" is no longer an inline
// table — it's a link into the dedicated /explore Award Explorer, which does all
// the pricing, filtering and slicing. The agent only supplies origin/destination
// (+ the source it inferred, shown as context); the page owns everything else.
function exploreHref({ origin, destination }: ShowAwardOptionsInput): string {
  const q = new URLSearchParams()
  if (origin) q.set('origin', origin.toUpperCase())
  if (destination) q.set('destination', destination.toUpperCase())
  const qs = q.toString()
  return qs ? `/explore?${qs}` : '/explore'
}

export function ExploreLinkCard({ input }: { input: ShowAwardOptionsInput }) {
  const { origin, destination, source } = input
  const route = origin && destination ? `${origin.toUpperCase()} → ${destination.toUpperCase()}` : 'Award options'

  return (
    <Card className="flex flex-row items-center gap-3 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Plane className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{route}</div>
        <div className="truncate text-xs text-muted-foreground">
          {source ? `Explore award options · ${source}` : 'Explore every award option'}
        </div>
      </div>
      <a
        href={exploreHref(input)}
        className={cn(buttonVariants({ size: 'sm' }), 'shrink-0 gap-1.5')}
      >
        Open
        <ArrowRight className="size-3.5" />
      </a>
    </Card>
  )
}
