import { stringify as yamlStringify } from 'yaml'

// Magnify inventory API row shape (subset we actually use).
export interface MagnifyApiRow {
  id: number
  slug: string
  name: string
  denominationType: 'FIXED' | 'RANGE' | string
  denomination: number[] | null
  denominationMultiplier: number | null
  discount: number
  onlyLoyaltyMultiplier: number | null
  redemptionChannel: string[] | null
  categories: Array<{ name?: string } | string> | null
  logoUrl: string | null
}

export interface MagnifyApiResponse {
  status: string
  data: MagnifyApiRow[]
}

// SOT row — the YAML-serializable shape. Drops HTML prose
// (merchantDescription, redemptionInstructions) since we have no question
// in v1 that needs it; can add back as raw markdown later if needed.
export interface VoucherBrand {
  slug: string
  name: string
  denominations_inr: number[]
  denomination_type: string
  discount_pct: number
  loyalty_multiplier_pct: number | null
  channels: string[]
  categories: string[]
  logo_url: string | null
}

export interface VoucherPlatformDoc {
  platform: string
  platform_url: string
  fetched_at: string
  brand_count: number
  brands: VoucherBrand[]
}

// Magnify returns denominations in paise. Convert to rupees with up to 2 dp.
function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100
}

// Magnify returns loyalty multiplier as a fraction (0.022 = 2.2%). Surface
// as a percent number for human readability in the YAML.
function fractionToPct(x: number | null | undefined): number | null {
  if (x == null) return null
  return Math.round(x * 10000) / 100
}

function normaliseCategories(
  cats: MagnifyApiRow['categories'],
): string[] {
  if (!cats) return []
  return cats
    .map((c) => (typeof c === 'string' ? c : c?.name ?? ''))
    .filter((s): s is string => Boolean(s))
}

export function transformMagnifyRow(row: MagnifyApiRow): VoucherBrand {
  return {
    slug: row.slug,
    name: row.name,
    denominations_inr: (row.denomination ?? []).map(paiseToRupees),
    denomination_type: row.denominationType,
    discount_pct: row.discount,
    loyalty_multiplier_pct: fractionToPct(row.onlyLoyaltyMultiplier),
    channels: row.redemptionChannel ?? [],
    categories: normaliseCategories(row.categories),
    logo_url: row.logoUrl,
  }
}

// Stable ordering by slug — keeps the diff between daily refreshes small
// and reviewable. Without this, the Magnify API's row order (by id desc)
// would surface every new brand as a churn in the middle of the file.
// Rows with a null/empty slug are dropped — slug is the identity we key
// on downstream and Magnify occasionally surfaces incomplete entries.
export function buildMagnifyDoc(
  rows: MagnifyApiRow[],
  fetchedAt: string,
): VoucherPlatformDoc {
  const brands = rows
    .filter((r) => typeof r.slug === 'string' && r.slug.length > 0)
    .map(transformMagnifyRow)
  brands.sort((a, b) => a.slug.localeCompare(b.slug))
  return {
    platform: 'Magnify',
    platform_url: 'https://www.magnify.club',
    fetched_at: fetchedAt,
    brand_count: brands.length,
    brands,
  }
}

export function renderMagnifyYaml(doc: VoucherPlatformDoc): string {
  return yamlStringify(doc, {
    lineWidth: 0,
    minContentWidth: 0,
    indent: 2,
  })
}
