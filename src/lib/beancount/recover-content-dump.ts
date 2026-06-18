// Gemma on Workers AI intermittently "content-dumps": instead of calling
// `draft_transaction`, it returns the whole draft as a valid JSON object in the
// TEXT channel (`finish=stop`). The bytes are fine — only the channel is wrong —
// so we re-channel them at the recording layer (see ChatDO.runDraftStatement)
// rather than fight the SDK's tool plumbing.
//
// This is a PURE, deterministic extractor — no model, no SDK. Given the text of a
// no-tool-call response, return the draft's entry texts, or [] if the text is not
// a recoverable draft (prose, partial/truncated JSON, or wrong shape). It accepts
// BOTH shapes gemma emits for `entries`:
//   • a MAP   `{ "entries": { "t1": "<entry>", "t2": "<entry>" } }`  (recording tool)
//   • an ARRAY `{ "entries": [ { "text": "<entry>" }, "<entry>" ] }` (editor prior)
export function recoverContentDumpedEntries(text: string | undefined | null): string[] {
  const t = (text ?? '').trim()
  // Must be a complete JSON object. A truncated dump (finish=length) won't end in
  // `}` and is correctly rejected — there's nothing complete to recover.
  if (!t.startsWith('{') || !t.endsWith('}')) return []
  let obj: unknown
  try {
    obj = JSON.parse(t)
  } catch {
    return []
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return []
  const entries = (obj as { entries?: unknown }).entries
  if (entries == null) return []

  let raw: unknown[]
  if (Array.isArray(entries)) {
    // array of {id?,text} objects OR bare strings
    raw = entries.map((e) =>
      e && typeof e === 'object' && !Array.isArray(e) && 'text' in (e as object)
        ? (e as { text?: unknown }).text
        : e,
    )
  } else if (typeof entries === 'object') {
    raw = Object.values(entries as Record<string, unknown>)
  } else {
    return []
  }
  return raw.map((v) => String(v ?? '').trim()).filter(Boolean)
}
