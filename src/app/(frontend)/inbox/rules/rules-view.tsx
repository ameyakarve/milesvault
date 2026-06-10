'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SectionLabel, StateChip, CenteredState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Rule = {
  id: number
  from_match: string | null
  subject_match: string | null
  action: string
  prompt: string | null
  enabled: number
  created_at: number
}

// Email ingestion rules (experience.md §9). A rule = matcher (from/subject
// substring, case-insensitive) + action. First enabled match wins, top to
// bottom; an email matching no rule is still captured (the safe default) —
// 'ignore' rules are for noise like OTPs and promos.
export function RulesView() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // add-form state
  const [fromMatch, setFromMatch] = useState('')
  // Playground seed (set by the activity log's replay buttons); bumping the
  // key remounts the playground with the new values.
  const [seed, setSeed] = useState<PlaygroundSeed | null>(null)
  const [seedKey, setSeedKey] = useState(0)
  const [subjectMatch, setSubjectMatch] = useState('')
  const [action, setAction] = useState<'capture' | 'ignore'>('capture')
  const [prompt, setPrompt] = useState('')

  function refresh() {
    fetch('/api/ledger/email-rules')
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: Rule[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRules(d.rows ?? []))
      .catch((e) => setError(String(e)))
  }
  useEffect(refresh, [])

  function addRule() {
    if (!fromMatch.trim() && !subjectMatch.trim()) return
    setSaving(true)
    fetch('/api/ledger/email-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from_match: fromMatch.trim() || null,
        subject_match: subjectMatch.trim() || null,
        action,
        prompt: action === 'capture' ? prompt.trim() || null : null,
        enabled: true,
      }),
    })
      .then((r) => (r.ok ? null : Promise.reject(new Error(String(r.status)))))
      .then(() => {
        setFromMatch('')
        setSubjectMatch('')
        setPrompt('')
        setAction('capture')
        refresh()
      })
      .catch((e) => setError(String(e)))
      .finally(() => setSaving(false))
  }

  function toggle(rule: Rule) {
    fetch('/api/ledger/email-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    }).then(refresh)
  }

  function remove(id: number) {
    fetch(`/api/ledger/email-rules?id=${id}`, { method: 'DELETE' }).then(refresh)
  }

  // Chip tone mapping for rules: capture→active, ignore→neutral
  function ruleChipTone(a: string) {
    return a === 'capture' ? 'active' as const : 'neutral' as const
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-6">
      <div className="space-y-1">
        <SectionLabel>Email rules</SectionLabel>
        <p className="text-sm text-muted-foreground">
          When a forwarded transaction email matches a rule, its prompt steers the review (or the
          email is ignored). First enabled match wins, top to bottom. Emails matching nothing are
          still captured.{' '}
          <Link href="/inbox" className="text-foreground underline underline-offset-4 hover:no-underline">
            Back to Inbox
          </Link>
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* existing rules */}
      <ul className="space-y-2">
        {(rules ?? []).map((r) => (
          <li
            key={r.id}
            className={`rounded-xl border bg-card px-4 py-3 space-y-1 ${r.enabled ? 'border-border' : 'border-border opacity-60'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-foreground">
                {r.from_match ? (
                  <>
                    from contains <span className="font-mono text-muted-foreground">{r.from_match}</span>
                  </>
                ) : null}
                {r.from_match && r.subject_match ? ' · ' : null}
                {r.subject_match ? (
                  <>
                    subject contains{' '}
                    <span className="font-mono text-muted-foreground">{r.subject_match}</span>
                  </>
                ) : null}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <StateChip tone={ruleChipTone(r.action)}>{r.action}</StateChip>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => toggle(r)}
                  className="text-muted-foreground"
                >
                  {r.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => remove(r.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Delete
                </Button>
              </div>
            </div>
            {r.action === 'capture' && r.prompt ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.prompt}</p>
            ) : null}
          </li>
        ))}
        {rules !== null && rules.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No rules yet — every forwarded email is captured as-is.
          </li>
        ) : null}
      </ul>

      {/* add rule */}
      <div className="rounded-xl border border-border bg-card px-4 py-4 space-y-3">
        <SectionLabel>New rule</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={fromMatch}
            onChange={(e) => setFromMatch(e.target.value)}
            placeholder="From contains… (alerts@hdfcbank.net)"
          />
          <Input
            value={subjectMatch}
            onChange={(e) => setSubjectMatch(e.target.value)}
            placeholder="Subject contains… (transaction alert)"
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <input
              type="radio"
              className="accent-foreground"
              checked={action === 'capture'}
              onChange={() => setAction('capture')}
            />
            Capture with prompt
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <input
              type="radio"
              className="accent-foreground"
              checked={action === 'ignore'}
              onChange={() => setAction('ignore')}
            />
            Ignore
          </label>
        </div>
        {action === 'capture' ? (
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={`Prompt for the review — e.g. "HDFC alert: extract the single card transaction, expense category from the merchant name, tag #cc-hdfc."`}
          />
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={saving || (!fromMatch.trim() && !subjectMatch.trim())}
          onClick={addRule}
        >
          Add rule
        </Button>
      </div>

      <Playground seed={seed} key={seedKey} />

      <ActivityLog
        onReplay={(s) => {
          setSeed(s)
          setSeedKey((k) => k + 1)
        }}
      />
    </div>
  )
}

type PlaygroundSeed = { from: string; subject: string; text: string }

type TestResult = {
  match: { action: string; prompt: string | null; rule_id: number | null }
  preview: { entries: string[]; note: string } | null
}

// Dry-run a pasted email against the rules (experience.md §9): shows which
// rule fires, and optionally what the agent would draft. Nothing is captured
// or committed.
function Playground({ seed }: { seed?: PlaygroundSeed | null }) {
  const [from, setFrom] = useState(seed?.from ?? '')
  const [subject, setSubject] = useState(seed?.subject ?? '')
  const [text, setText] = useState(seed?.text ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(preview: boolean) {
    setBusy(true)
    setError(null)
    fetch('/api/ledger/email-rules/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, subject, text, preview }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<TestResult>) : Promise.reject(new Error(String(r.status)))))
      .then(setResult)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4 space-y-3">
      <SectionLabel>Playground</SectionLabel>
      <p className="text-xs text-muted-foreground">
        Paste a transaction email to see which rule fires — and what the agent would draft.
        Nothing is captured or committed.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Email body…"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run(false)}
        >
          Which rule fires?
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !text.trim()}
          onClick={() => run(true)}
        >
          {busy ? 'Running…' : 'Preview drafts'}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <div className="space-y-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="text-foreground">
            {result.match.rule_id != null ? (
              <>
                Rule #{result.match.rule_id} fires → <strong>{result.match.action}</strong>
                {result.match.prompt ? (
                  <span className="block text-xs text-muted-foreground whitespace-pre-wrap">
                    {result.match.prompt}
                  </span>
                ) : null}
              </>
            ) : (
              <>No rule matches → captured as-is (the safe default).</>
            )}
          </p>
          {result.preview ? (
            result.preview.entries.length ? (
              <pre className="overflow-x-auto rounded-lg border border-border bg-background p-2 font-mono text-xs text-foreground">
                {result.preview.entries.join('\n\n')}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                The agent proposed no entries{result.preview.note ? ` — ${result.preview.note}` : '.'}
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type IngestRow = {
  id: number
  from_addr: string | null
  subject: string | null
  outcome: string
  rule_id: number | null
  capture_id: string | null
  body_excerpt: string | null
  created_at: number
}

// Chip tone for activity outcomes: captured→active, ignored→neutral, rejected→negative
function outcomeTone(outcome: string) {
  if (outcome === 'captured') return 'active' as const
  if (outcome === 'rejected') return 'negative' as const
  return 'neutral' as const
}

// The automation log (experience.md §9): every inbound email and what
// happened to it. Replay loads it into the playground above.
function ActivityLog({ onReplay }: { onReplay: (seed: PlaygroundSeed) => void }) {
  const [rows, setRows] = useState<IngestRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/ingest-log')
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: IngestRow[] }>) : null))
      .then((d) => !cancelled && d && setRows(d.rows ?? []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (rows === null || rows.length === 0) return null

  return (
    <div className="space-y-2">
      <SectionLabel>Activity ({rows.length})</SectionLabel>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{r.subject ?? '(no subject)'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.from_addr ?? 'unknown sender'} ·{' '}
                {new Date(r.created_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {r.rule_id != null ? ` · rule #${r.rule_id}` : ' · no rule'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StateChip tone={outcomeTone(r.outcome)}>{r.outcome}</StateChip>
              {r.body_excerpt ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    onReplay({
                      from: r.from_addr ?? '',
                      subject: r.subject ?? '',
                      text: r.body_excerpt ?? '',
                    })
                  }
                  className="whitespace-nowrap"
                >
                  Test in playground
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
