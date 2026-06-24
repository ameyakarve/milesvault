// Tokenized matcher for typeahead search over KG nodes.
//
// Splits any string into lowercased alphanumeric tokens, so spaced, hyphenated,
// slugged, and mixed-case forms all yield the SAME tokens:
//   "American Express", "american-express", "AMERICAN EXPRESS", "cc/american-express"
//     → ["american", "express"]
// A query matches a candidate when EVERY query token is a PREFIX of some token in
// the candidate's searchable text (its display name + slug + aliases). Prefix
// (not exact) so partial typing still matches — "amer expr" → "American Express".
//
// Why prefix-on-tokens rather than raw substring: the KB's resolve does substring
// matching on the display name / hyphenated alias slug, so a spaced query like
// "american express" can never hit a hyphenated alias slug. Tokenizing both sides
// removes the separator mismatch and lets multi-word queries match in any order.

export function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

// True when every token of `query` is a prefix of some token in `haystack`.
export function matchesTokens(query: string, haystack: string): boolean {
  const q = tokenize(query)
  if (q.length === 0) return false
  const h = tokenize(haystack)
  return q.every((qt) => h.some((ht) => ht.startsWith(qt)))
}
