import type { ReactElement } from 'react'

// Original, simplified vector marks standing in for the bigger banks — drawn
// from scratch (NOT the trademarked logos), single-color so they sit cleanly in
// white on the card-art band. Unknown issuers fall back to an initials badge.
type MarkProps = { className?: string }

function Frame({
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
      strokeWidth={stroke ? 2 : undefined}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {children}
    </svg>
  )
}

const MARKS: Record<string, (p: MarkProps) => ReactElement> = {
  // bowtie of two triangles
  hsbc: ({ className }) => (
    <Frame className={className}>
      <path d="M3 3 L12 12 L3 21 Z M21 3 L12 12 L21 21 Z" />
    </Frame>
  ),
  // the "blue box"
  amex: ({ className }) => (
    <Frame className={className} stroke>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M8 15 L10.5 9 L13 15 M16 9 v6 M16 9 h2.5 M16 12 h2" />
    </Frame>
  ),
  // arc over the wordmark
  citi: ({ className }) => (
    <Frame className={className} stroke>
      <path d="M4 11 A9 9 0 0 1 20 11" />
      <path d="M9 15 v3 M15 15 v3" />
    </Frame>
  ),
  // keyhole ring
  sbi: ({ className }) => (
    <Frame className={className} stroke>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 12 V3.5" />
    </Frame>
  ),
  // peak / A
  axis: ({ className }) => (
    <Frame className={className}>
      <path d="M12 3 L21 21 H15.5 L12 13.5 L8.5 21 H3 Z" />
    </Frame>
  ),
  // split square
  hdfc: ({ className }) => (
    <Frame className={className} stroke>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 20.5 L20.5 3.5" />
    </Frame>
  ),
  // lowercase i
  icici: ({ className }) => (
    <Frame className={className}>
      <circle cx="12" cy="5" r="2.5" />
      <rect x="9.5" y="9" width="5" height="12" rx="2.5" />
    </Frame>
  ),
  // overlapping rings
  kotak: ({ className }) => (
    <Frame className={className} stroke>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </Frame>
  ),
}

const ALIASES: Record<string, string> = {
  americanexpress: 'amex',
  sbicard: 'sbi',
  citibank: 'citi',
  hdfcbank: 'hdfc',
  icicibank: 'icici',
  kotakmahindra: 'kotak',
}

function initials(issuer: string): string {
  const clean = issuer.replace(/[^a-zA-Z0-9]/g, '')
  return (clean.slice(0, 2) || '?').toUpperCase()
}

export function BankMark({ issuer, className }: { issuer: string | null; className?: string }) {
  const key = (issuer ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const mark = MARKS[key] ?? MARKS[ALIASES[key] ?? '']
  if (mark) return mark({ className })
  // Fallback: an initials badge, same white-on-band treatment.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.65"
      />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {initials(issuer ?? '')}
      </text>
    </svg>
  )
}
