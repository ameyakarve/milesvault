import { DurableObject } from 'cloudflare:workers'

// Phase 0 skeleton. Subsequent phases will swap the base class to `Think` and
// add tools, system prompt, and session config.
export class AgentDO extends DurableObject<CloudflareEnv> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    return Response.json({
      ok: true,
      who: 'AgentDO',
      phase: 0,
      path: url.pathname,
    })
  }
}
