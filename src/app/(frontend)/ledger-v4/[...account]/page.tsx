import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { PerAccountView } from '../per-account-view'

export default async function LedgerV4Page({
  params,
}: {
  params: Promise<{ account: string[] }>
}) {
  const [{ account: segments }, session] = await Promise.all([params, auth()])
  if (!session?.user) {
    redirect(`/login?callbackUrl=/ledger-v4/${segments.join('/')}`)
  }
  const account = segments.join(':')
  return <PerAccountView account={account} />
}
