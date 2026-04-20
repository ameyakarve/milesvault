const ACCOUNT_RE = /^[ \t]+([A-Z][A-Za-z0-9-]*(?::[A-Z0-9][A-Za-z0-9-]*)+)(?=\s|$)/gm

export function distinctAccountsFromRawTexts(rawTexts: Iterable<string>): string[] {
  const set = new Set<string>()
  for (const text of rawTexts) {
    for (const m of text.matchAll(ACCOUNT_RE)) set.add(m[1])
  }
  return Array.from(set).sort()
}
