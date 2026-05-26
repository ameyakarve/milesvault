'use client'

// Placeholder registry. The previous generation of agent display tools
// (show_vega, show_account_card, extract_statement_rows, propose_journal_edit)
// has been removed; new write-path tools will register their renderers here.

export function isGenUiTool(_typeOrName: string): boolean {
  return false
}

export function renderGenUi(
  _typeOrName: string,
  _input: unknown,
): React.ReactElement | null {
  return null
}
