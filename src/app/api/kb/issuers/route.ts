import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

// Issuers offered in the add-card form's Issuer dropdown. Slugs are the KG
// bank slugs (bank/<slug>); display names are what the user sees. Kept as a
// curated list — the common Indian issuers, in rough usage order.
const ISSUERS = [
  { slug: 'axis', name: 'Axis Bank' },
  { slug: 'hdfc', name: 'HDFC Bank' },
  { slug: 'icici', name: 'ICICI Bank' },
  { slug: 'sbi', name: 'SBI' },
  { slug: 'amex', name: 'American Express' },
  { slug: 'hsbc-india', name: 'HSBC' },
  { slug: 'idfc-first', name: 'IDFC First' },
  { slug: 'indusind', name: 'IndusInd' },
  { slug: 'kotak', name: 'Kotak' },
  { slug: 'rbl', name: 'RBL' },
  { slug: 'standard-chartered', name: 'Standard Chartered' },
  { slug: 'yes', name: 'YES Bank' },
  { slug: 'au-small-finance', name: 'AU Small Finance' },
  { slug: 'federal', name: 'Federal Bank' },
  { slug: 'onecard', name: 'OneCard' },
  { slug: 'dbs', name: 'DBS' },
]

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.key)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ items: ISSUERS })
}
