export type Payee = {
  canonicalName: string
  defaultAccount?: string
  defaultCategory?: string
  logo?: string
}

export const PAYEES: Record<string, Payee> = {}

export function getPayee(name: string): Payee | null {
  return PAYEES[name] ?? null
}
