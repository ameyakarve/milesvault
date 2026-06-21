// Feature flags, backed by the Cloudflare Flagship `FLAGS` binding.
//
// `concierge_enabled` gates the concierge assistant (in-app chat AND the
// Telegram bot — both funnel through ConciergeDO). The Flagship targeting rule
// (configured in the dashboard) turns it ON for the admin email and leaves it
// OFF for everyone else. Evaluation is FAIL-CLOSED: any error, a missing
// binding, or an unreachable Flagship resolves to `false`, so the assistant
// stays dark rather than erroring the app.
export async function conciergeEnabled(
  env: Cloudflare.Env,
  user: { email?: string | null },
): Promise<boolean> {
  const email = user.email ?? undefined
  if (!email) return false
  try {
    return await env.FLAGS.getBooleanValue('concierge_enabled', false, { email })
  } catch (err) {
    console.warn(`[flags] concierge_enabled eval failed: ${err}`)
    return false
  }
}
