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

// `app_access` is the login gate: may this user sign in? Evaluated with the
// user's email AND the environment (production | staging), so a single Flagship
// app can gate both with per-env, per-email (or percentage) targeting rules —
// flipped from the dashboard, no redeploy. Evaluation is FAIL-OPEN: the DEFAULT
// is allow, so an unconfigured flag or an unreachable Flagship never locks the
// app out. To restrict, set the flag's dashboard default OFF and add allow-rules
// for the cohorts you want in.
export async function appAccessAllowed(
  env: Cloudflare.Env,
  ctx: { email: string; environment: string },
): Promise<boolean> {
  try {
    return await env.FLAGS.getBooleanValue('app_access', true, {
      email: ctx.email,
      environment: ctx.environment,
    })
  } catch (err) {
    console.warn(`[flags] app_access eval failed: ${err}`)
    return true // fail-open: a flag hiccup must never lock everyone out
  }
}
