import { splitEntries } from '@/lib/beancount/extract'

export type Snapshot = { id: number; raw_text: string; expected_updated_at: number }

export type Proposal =
  | { kind: 'create'; raw_text: string }
  | { kind: 'update'; id: number; raw_text: string }
  | { kind: 'delete'; id: number }

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

  const loc = locateBySnapshotId(buffer, snapshots, p.id)
  if (!loc) return { ok: false, reason: `txn #${p.id} not found or already edited in buffer` }

  const offsets = lineOffsets(buffer)
  const startOffset = offsets[loc.startLine]
  let endOffset = offsets[loc.endLine + 1]

  if (p.kind === 'delete') {
    while (buffer[endOffset] === '\n') endOffset++
    return { ok: true, buffer: buffer.slice(0, startOffset) + buffer.slice(endOffset) }
  }

  const replacement = p.raw_text.trim() + '\n'
  return { ok: true, buffer: buffer.slice(0, startOffset) + replacement + buffer.slice(endOffset) }
}
