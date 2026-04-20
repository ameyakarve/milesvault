import { splitEntries } from '@/lib/beancount/extract'

export type Snapshot = { id: number; raw_text: string; expected_updated_at: number }

export type Proposal =
  | { kind: 'create'; raw_text: string }
  | { kind: 'update'; id: number; raw_text: string }
  | { kind: 'delete'; id: number }
  | { kind: 'replace_text'; old_raw_text: string; raw_text: string }
  | { kind: 'delete_text'; old_raw_text: string }

export type ProposalResult =
  | { ok: true; buffer: string }
  | { ok: false; reason: string }

function lineOffsets(buffer: string): number[] {
  const out: number[] = [0]
  const lines = buffer.split('\n')
  for (let i = 0; i < lines.length; i++) {
    out.push(out[i] + lines[i].length + 1)
  }
  return out
}

function locateBySnapshotId(
  buffer: string,
  snapshots: Snapshot[],
  id: number,
): { startLine: number; endLine: number; rawText: string } | null {
  const snap = snapshots.find((s) => s.id === id)
  if (!snap) return null
  const parts = splitEntries(buffer)
  const match = parts.find((p) => p.text.trim() === snap.raw_text.trim())
  if (!match) return null
  return { startLine: match.startLine, endLine: match.endLine, rawText: snap.raw_text }
}

function locateByRawText(
  buffer: string,
  raw_text: string,
): { startLine: number; endLine: number } | null {
  const target = raw_text.trim()
  const parts = splitEntries(buffer)
  const match = parts.find((p) => p.text.trim() === target)
  if (!match) return null
  return { startLine: match.startLine, endLine: match.endLine }
}

export function applyProposal(
  buffer: string,
  snapshots: Snapshot[],
  p: Proposal,
): ProposalResult {
  if (p.kind === 'create') {
    const clean = p.raw_text.trim()
    if (!clean) return { ok: false, reason: 'empty raw_text' }
    const stripped = buffer.replace(/\n+$/, '')
    const next = stripped.length === 0 ? `${clean}\n` : `${stripped}\n\n${clean}\n`
    return { ok: true, buffer: next }
  }

  const loc =
    p.kind === 'replace_text' || p.kind === 'delete_text'
      ? locateByRawText(buffer, p.old_raw_text)
      : locateBySnapshotId(buffer, snapshots, p.id)
  if (!loc) {
    const label =
      p.kind === 'replace_text' || p.kind === 'delete_text'
        ? 'entry with that raw_text'
        : `txn #${(p as { id: number }).id}`
    return { ok: false, reason: `${label} not found or already edited in buffer` }
  }

  const offsets = lineOffsets(buffer)
  const startOffset = offsets[loc.startLine]
  let endOffset = offsets[loc.endLine + 1]

  if (p.kind === 'delete' || p.kind === 'delete_text') {
    while (buffer[endOffset] === '\n') endOffset++
    return { ok: true, buffer: buffer.slice(0, startOffset) + buffer.slice(endOffset) }
  }

  const replacement = p.raw_text.trim() + '\n'
  return { ok: true, buffer: buffer.slice(0, startOffset) + replacement + buffer.slice(endOffset) }
}
