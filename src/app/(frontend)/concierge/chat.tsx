'use client'

import { useState, useEffect } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DraftChat } from '@/app/(frontend)/_chat/draft-chat'

// The concierge now renders the SHARED DraftChat — same message rendering, copy
// button, reasoning/tool/gen-UI cards, composer, and footer as the editor. Its
// differences are passed as props: it's read-only Q&A (autoContinueAfterToolResult,
// single-agent so no reset-on-clear), `ask_user` resolution is handled inside
// DraftChat, and gen-UI cards (award options) reject via the shared registry.
export function ConciergeChat() {
  const [clearState, setClearState] = useState<{ canClear: boolean; clear: () => void }>({
    canClear: false,
    clear: () => {},
  })
  const [busy, setBusy] = useState(false)
  // DraftChat opens a WebSocket via useAgent/useAgentChat; its first render
  // depends on live socket state that can't exist during SSR, so server HTML and
  // the first client render diverge (React #418). Mount it only after hydration
  // — the same gate the editor uses — so DraftChat never SSRs and can use the
  // library's real getInitialMessages loader (instead of the global null hack).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Concierge</h1>
          <p className="text-xs text-muted-foreground">
            Ask anything about your ledger — spending, balances, trends.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => clearState.clear()}
          disabled={!clearState.canClear || busy}
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          <Trash2 className="size-3.5" />
          Clear
        </Button>
      </header>

      {mounted && (
      <DraftChat
        agentOptions={{ agent: 'ConciergeDO', basePath: 'api/agents/concierge' }}
        autoContinueAfterToolResult
        resetAgentOnClear={false}
        onBusyChange={setBusy}
        onClearableChange={setClearState}
        placeholder="Ask about your ledger…"
        footerNote="MilesVault can make mistakes. Check important info."
        emptyState={(composer) => (
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="flex w-full max-w-3xl -translate-y-8 flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                <Database className="size-6" />
                <p className="text-sm">
                  Ask a question to get started — e.g. &ldquo;How much did I spend on restaurants
                  last month?&rdquo;
                </p>
              </div>
              <div className="flex w-full flex-col gap-3">{composer}</div>
            </div>
          </div>
        )}
      />
      )}
    </div>
  )
}

