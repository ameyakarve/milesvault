import { useEffect, useRef, type RefObject } from 'react'
import { splitEntries } from '@/lib/beancount/extract'
import type { LedgerEditorHandle } from './ledger-editor'

type Driver = 'cards' | 'editor' | null

type UseSyncScrollArgs = {
  cardsRef: RefObject<HTMLDivElement | null>
  editorHandleRef: RefObject<LedgerEditorHandle | null>
  enabled: boolean
  txnCount: number
}

export function useSyncScroll({
  cardsRef,
  editorHandleRef,
  enabled,
  txnCount,
}: UseSyncScrollArgs): void {
  const driverRef = useRef<Driver>(null)

  useEffect(() => {
    if (!enabled || txnCount < 2) return
    const cardsEl = cardsRef.current
    const view = editorHandleRef.current?.getView() ?? null
    if (!cardsEl || !view) return

    const editorScroll = view.scrollDOM

    function getCardTops(): number[] {
      if (!cardsEl) return []
      const children = Array.from(cardsEl.children) as HTMLElement[]
      return children.map((el) => el.offsetTop)
    }

    function getEditorTops(): number[] {
      if (!view) return []
      const doc = view.state.doc
      const entries = splitEntries(doc.toString())
      return entries.map((entry) => {
        const line = doc.line(entry.startLine + 1)
        return view.lineBlockAt(line.from).top
      })
    }

    function interpolate(sourceTops: number[], targetTops: number[], s: number): number {
      if (sourceTops.length === 0 || targetTops.length === 0) return 0
      if (s <= sourceTops[0]) return targetTops[0]
      for (let i = 0; i < sourceTops.length - 1; i++) {
        const a = sourceTops[i]
        const b = sourceTops[i + 1]
        if (s >= a && s < b) {
          const frac = (s - a) / (b - a)
          return targetTops[i] + frac * (targetTops[i + 1] - targetTops[i])
        }
      }
      return targetTops[targetTops.length - 1]
    }

    function onCardsScroll() {
      if (driverRef.current !== 'cards' || !cardsEl) return
      const target = interpolate(getCardTops(), getEditorTops(), cardsEl.scrollTop)
      editorScroll.scrollTop = target
    }
    function onEditorScroll() {
      if (driverRef.current !== 'editor' || !cardsEl) return
      const target = interpolate(getEditorTops(), getCardTops(), editorScroll.scrollTop)
      cardsEl.scrollTop = target
    }

    const setCards = () => {
      driverRef.current = 'cards'
    }
    const setEditor = () => {
      driverRef.current = 'editor'
    }

    cardsEl.addEventListener('wheel', setCards, { passive: true })
    cardsEl.addEventListener('pointerdown', setCards)
    cardsEl.addEventListener('touchstart', setCards, { passive: true })
    cardsEl.addEventListener('scroll', onCardsScroll, { passive: true })

    editorScroll.addEventListener('wheel', setEditor, { passive: true })
    editorScroll.addEventListener('pointerdown', setEditor)
    editorScroll.addEventListener('touchstart', setEditor, { passive: true })
    editorScroll.addEventListener('scroll', onEditorScroll, { passive: true })
    view.contentDOM.addEventListener('keydown', setEditor)

    return () => {
      cardsEl.removeEventListener('wheel', setCards)
      cardsEl.removeEventListener('pointerdown', setCards)
      cardsEl.removeEventListener('touchstart', setCards)
      cardsEl.removeEventListener('scroll', onCardsScroll)
      editorScroll.removeEventListener('wheel', setEditor)
      editorScroll.removeEventListener('pointerdown', setEditor)
      editorScroll.removeEventListener('touchstart', setEditor)
      editorScroll.removeEventListener('scroll', onEditorScroll)
      view.contentDOM.removeEventListener('keydown', setEditor)
    }
  }, [cardsRef, editorHandleRef, enabled, txnCount])
}
