'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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

  const inputCls =
    'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
          Email rules
        </p>
        <p className="text-sm text-slate-500">
          When a forwarded transaction email matches a rule, its prompt steers the review (or the
          email is ignored). First enabled match wins, top to bottom. Emails matching nothing are
          still captured.{' '}
          <Link href="/inbox" className="text-teal-600 hover:underline">
            Back to Inbox
          </Link>
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* existing rules */}
      <ul className="space-y-2">
        {(rules ?? []).map((r) => (
          <li
            key={r.id}
            className={`rounded-lg border bg-white px-4 py-3 space-y-1 ${r.enabled ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-slate-700">
                {r.from_match ? (
                  <>
                    from contains <span className="font-mono text-slate-600">{r.from_match}</span>
                  </>
                ) : null}
                {r.from_match && r.subject_match ? ' · ' : null}
                {r.subject_match ? (
                  <>
                    subject contains{' '}
                    <span className="font-mono text-slate-600">{r.subject_match}</span>
                  </>
                ) : null}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    r.action === 'ignore'
                      ? 'bg-slate-50 text-slate-500 border-slate-200'
                      : 'bg-teal-50 text-teal-700 border-teal-200'
                  }`}
                >
                  {r.action}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(r)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
            {r.action === 'capture' && r.prompt ? (
              <p className="text-xs text-slate-500 whitespace-pre-wrap">{r.prompt}</p>
            ) : null}
          </li>
        ))}
        {rules !== null && rules.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            No rules yet — every forwarded email is captured as-is.
          </li>
        ) : null}
      </ul>

      {/* add rule */}
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">New rule</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={fromMatch}
            onChange={(e) => setFromMatch(e.target.value)}
            placeholder="From contains… (alerts@hdfcbank.net)"
            className={inputCls}
          />
          <input
            value={subjectMatch}
            onChange={(e) => setSubjectMatch(e.target.value)}
            placeholder="Subject contains… (transaction alert)"
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-slate-600">
            <input
              type="radio"
              checked={action === 'capture'}
              onChange={() => setAction('capture')}
            />
            Capture with prompt
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="radio" checked={action === 'ignore'} onChange={() => setAction('ignore')} />
            Ignore
          </label>
        </div>
        {action === 'capture' ? (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Prompt for the review — e.g. “HDFC alert: extract the single card transaction, expense category from the merchant name, tag #cc-hdfc.”"
            className={inputCls}
          />
        ) : null}
        <button
          type="button"
          disabled={saving || (!fromMatch.trim() && !subjectMatch.trim())}
          onClick={addRule}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Add rule
        </button>
      </div>
    </div>
  )
}
