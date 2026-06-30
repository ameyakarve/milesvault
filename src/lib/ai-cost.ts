// Per-token prices for the Workers AI models we call, USD per MILLION tokens,
// from Cloudflare's Workers AI pricing page. Update when CF moves them. Only
// gemma is user-facing; the llama judge is eval-only (kept for completeness).
//   https://developers.cloudflare.com/workers-ai/platform/pricing/
const PRICES: Record<string, { inPerMillion: number; outPerMillion: number }> = {
  '@cf/google/gemma-4-26b-a4b-it': { inPerMillion: 0.1, outPerMillion: 0.3 },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { inPerMillion: 0.29, outPerMillion: 2.25 },
}

// Cost of one generation in integer MICRO-USD (1e-6 USD). Integers keep the
// per-user ledger free of float drift. An unknown model records 0 with a warn,
// so a missing price is visible rather than silently mispriced.
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model]
  if (!p) {
    console.warn(`[ai-cost] no price for "${model}" — recording cost 0`)
    return 0
  }
  const usd = (inputTokens / 1_000_000) * p.inPerMillion + (outputTokens / 1_000_000) * p.outPerMillion
  return Math.round(usd * 1_000_000)
}

// Fair-use ceiling per user per calendar month (USD). The enforcement wrapper
// blocks a model call once the user's month-to-date spend reaches this.
//
// ⚠️ PLACEHOLDER — deliberately HIGH so it won't block any real user yet (at
// gemma rates this is thousands of turns). Set the real number before relying
// on it. Constant for now; move to a Flagship `getNumberValue` (with the user's
// cohort as context) when per-tier limits are wanted — no code change at the
// call site, it just reads a different source.
export const MONTHLY_BUDGET_USD = 25

// Thrown by the usage middleware when a user is over their monthly ceiling.
// One typed error every surface can catch when breach messaging is wired later
// (today it just surfaces as a turn error — messaging is deferred).
export class BudgetExceededError extends Error {
  constructor() {
    super('monthly AI usage limit reached')
    this.name = 'BudgetExceededError'
  }
}
