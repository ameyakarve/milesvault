// The shell is rendered by ../layout.tsx, which stays mounted across the
// transactions boundary. PerAccountView reads usePathname() to swap in the
// expanded statement view when the URL ends in /transactions.
export default function LedgerTransactionsPage(): null {
  return null
}
