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
