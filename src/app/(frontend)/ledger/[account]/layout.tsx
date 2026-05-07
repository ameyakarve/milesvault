import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { PerAccountView } from '../per-account-view'

// Hoisted from page.tsx so navigating between /ledger/[account] and
// /ledger/[account]/transactions doesn't unmount the shell. PerAccountView
// reads usePathname() to switch the body when the URL ends in /transactions.
export default async function LedgerAccountLayout({
  params,
  children,
}: {
  params: Promise<{ account: string }>
  children: React.ReactNode
}) {
  const [{ account: encoded }, session] = await Promise.all([params, auth()])
  if (!session?.user) {
    redirect(`/login?callbackUrl=/ledger/${encoded}`)
  }
  const account = decodeURIComponent(encoded).replaceAll('.', ':')
  return (
    <>
      <PerAccountView account={account} />
      {children}
    </>
  )
}
