import { EditorView, WidgetType } from '@codemirror/view'
import { toChipSvg } from '@/lib/beancount/entities'
import { unveilChipAt } from './editor-chip-state'

export type ChipVariant =
  | 'account'
  | 'amount'
  | 'date'
  | 'payee'
  | 'narration'
  | 'flag-pending'
  | 'flag-cleared'
  | 'tag'

export type ChipSpec = {
  variant: ChipVariant
  label: string
  tooltip: string
  svg?: string
  width: number
}

const DOTS_LEADING: ReadonlySet<ChipVariant> = new Set(['amount'])

function appendDots(parent: HTMLElement, padCh: number): void {
  if (padCh <= 0) return
  const dots = document.createElement('span')
  dots.className = 'cm-chip__dots'
  dots.textContent = ' '.repeat(padCh)
  parent.appendChild(dots)
}

function appendIcon(parent: HTMLElement, svg: string): void {
  const icon = document.createElement('span')
  icon.className = 'cm-chip__icon'
  icon.innerHTML = toChipSvg(svg)
  parent.appendChild(icon)
}

export function renderChip(spec: ChipSpec): HTMLElement {
  const span = document.createElement('span')
  span.className = `cm-chip cm-chip--${spec.variant}`
  span.style.width = `${spec.width}ch`
  span.setAttribute('aria-label', spec.tooltip)

  const contentWidth = spec.label.length + (spec.svg ? 3 : 0)
  const pillMargin = spec.variant === 'account' ? 1 : 0
  const padCh = Math.max(0, spec.width - contentWidth - pillMargin)
  const leading = DOTS_LEADING.has(spec.variant)

  if (leading) appendDots(span, padCh)

  if (spec.variant === 'account') {
    const pill = document.createElement('span')
    pill.className = 'cm-chip__pill'
    if (spec.svg) appendIcon(pill, spec.svg)
    if (spec.label) pill.appendChild(document.createTextNode(spec.label))
    span.appendChild(pill)
  } else {
    if (spec.svg) appendIcon(span, spec.svg)
    if (spec.label) span.appendChild(document.createTextNode(spec.label))
  }

  if (!leading) appendDots(span, padCh)

  return span
}

export class ChipWidget extends WidgetType {
  constructor(readonly spec: ChipSpec) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const span = renderChip(this.spec)
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(span)
      unveilChipAt(view, pos)
    })
    return span
  }
  eq(other: WidgetType): boolean {
    if (!(other instanceof ChipWidget)) return false
    const a = this.spec
    const b = other.spec
    return (
      a.variant === b.variant &&
      a.label === b.label &&
      a.tooltip === b.tooltip &&
      a.svg === b.svg &&
      a.width === b.width
    )
  }
  ignoreEvent(): boolean {
    return false
  }
}
