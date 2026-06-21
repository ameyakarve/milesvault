import type { ReactElement } from 'react'
import { Hotel, Layers, Plane } from 'lucide-react'

// Original, simplified vector marks for the bigger loyalty programmes — drawn
// from scratch as generic single-color glyphs (NOT the trademarked logos), to
// sit in white on the full-color programme tile. Anything without a mark falls
// back to the category icon (plane for airlines, hotel for everything else).
type MarkProps = { className?: string }

function S({
  children,
  className,
  stroke,
}: {
  children: React.ReactNode
  className?: string
  stroke?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : undefined}
      strokeWidth={stroke ? 1.75 : undefined}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {children}
    </svg>
  )
}

const MARKS: Record<string, (p: MarkProps) => ReactElement> = {
  // interlocking swirl
  marriott: ({ className }) => (
    <S className={className} stroke>
      <path d="M4 13a4 4 0 1 1 8 0 4 4 0 1 0 8 0" />
    </S>
  ),
  // monogram H
  hilton: ({ className }) => (
    <S className={className} stroke>
      <path d="M7 5v14M17 5v14M7 12h10" />
    </S>
  ),
  // bird in flight
  krisflyer: ({ className }) => (
    <S className={className} stroke>
      <path d="M3 14c5 0 7-6 9-6s4 6 9 6" />
    </S>
  ),
  // wing
  emirates: ({ className }) => (
    <S className={className}>
      <path d="M3 17c8-1 12-6 18-9-3 6-7 9-13 11-2 .6-4 .4-5-2z" />
    </S>
  ),
  // curved horns
  qatar: ({ className }) => (
    <S className={className} stroke>
      <path d="M10 20C8 13 8 8 12 5c4 3 4 8 2 15" />
    </S>
  ),
  // bird within a ring
  lufthansa: ({ className }) => (
    <S className={className} stroke>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14c2-4 6-4 8 0" />
    </S>
  ),
  // globe
  united: ({ className }) => (
    <S className={className} stroke>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17M5.5 7.5c4 2.5 9 2.5 13 0M5.5 16.5c4-2.5 9-2.5 13 0" />
    </S>
  ),
  // spoked wheel
  airindia: ({ className }) => (
    <S className={className} stroke>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5M6.2 6.2l3.4 3.4M14.4 14.4l3.4 3.4M17.8 6.2l-3.4 3.4M9.6 14.4l-3.4 3.4" />
    </S>
  ),
  // ribbon swoosh
  avios: ({ className }) => (
    <S className={className} stroke>
      <path d="M3 14c6-6 12-7 18-4M4 18c6-5 11-6 16-4" />
    </S>
  ),
}

// Programme-name variants that map to the same mark.
const ALIASES: Record<string, string> = {
  bonvoy: 'marriott',
  honors: 'hilton',
  singapore: 'krisflyer',
  skywards: 'emirates',
  milesandmore: 'lufthansa',
  mileageplus: 'united',
  maharaja: 'airindia',
  british: 'avios',
}

export function ProgrammeMark({
  account,
  category,
  className,
}: {
  account: string
  category: 'airline' | 'hotel' | 'aggregator'
  className?: string
}) {
  const leaf = (account.split(':').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  let mark: ((p: MarkProps) => ReactElement) | undefined
  for (const k of Object.keys(MARKS)) if (leaf.includes(k)) { mark = MARKS[k]; break }
  if (!mark) for (const a of Object.keys(ALIASES)) if (leaf.includes(a)) { mark = MARKS[ALIASES[a]!]; break }
  if (mark) return mark({ className })
  // No brand mark — fall back to the real category icon.
  const Fallback = category === 'airline' ? Plane : category === 'aggregator' ? Layers : Hotel
  return <Fallback className={className} aria-hidden />
}
