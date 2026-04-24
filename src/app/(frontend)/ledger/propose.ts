import { splitEntries } from '@/lib/beancount/extract'
import { buildEntriesFromBuffer, type SnapshotLike } from '@/lib/ledger-reader/entries'

export type Snapshot = SnapshotLike

export type Op =
  | { op: 'create'; raw_text: string }
  | { op: 'update'; id: number; raw_text: string }
  | { op: 'delete'; id: number }

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

function appendEntry(buffer: string, clean: string): string {
  const stripped = buffer.replace(/\n+$/, '')
  return stripped.length === 0 ? `${clean}\n` : `${stripped}\n\n${clean}\n`
}

export function applyProposal(
  buffer: string,
  snapshots: ReadonlyArray<Snapshot>,
  ops: ReadonlyArray<Op>,
): ProposalResult {
  if (ops.length === 0) return { ok: true, buffer }

  const idToRaw = new Map<number, string>()
  for (const e of buildEntriesFromBuffer(buffer, snapshots)) {
    idToRaw.set(e.id, e.raw_text)
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.op === 'create' || op.op === 'update') {
      if (!op.raw_text.trim()) {
        return { ok: false, reason: `ops[${i}]: empty raw_text` }
      }
    }
    if (op.op === 'update' || op.op === 'delete') {
      if (!idToRaw.has(op.id)) {
        return { ok: false, reason: `ops[${i}]: id ${op.id} not in buffer` }
      }
    }
  }

  let current = buffer
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.op === 'create') {
      current = appendEntry(current, op.raw_text.trim())
      continue
    }
    const oldRaw = idToRaw.get(op.id)
    if (!oldRaw) {
      return { ok: false, reason: `ops[${i}]: id ${op.id} not in buffer` }
    }
    const loc = locateByRawText(current, oldRaw)
    if (!loc) {
      return { ok: false, reason: `ops[${i}]: id ${op.id} text shifted mid-batch` }
    }
    const offsets = lineOffsets(current)
    const startOffset = offsets[loc.startLine]
    let endOffset = offsets[loc.endLine + 1]
    if (op.op === 'delete') {
      while (current[endOffset] === '\n') endOffset++
      current = current.slice(0, startOffset) + current.slice(endOffset)
      idToRaw.delete(op.id)
      continue
    }
    const clean = op.raw_text.trim()
    current = current.slice(0, startOffset) + clean + '\n' + current.slice(endOffset)
    idToRaw.set(op.id, clean)
  }
  return { ok: true, buffer: current }
}
