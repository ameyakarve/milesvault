import { routeAgentRequest } from 'agents'
import { verifyChatToken } from '@/lib/chat/session-token'

type NextHandler = ExportedHandler<Cloudflare.Env>

export async function fetchWithAgents(
  request: Request,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
  next: NextHandler,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/agents/')) {
    const token = url.searchParams.get('token')
    if (!token) return new Response('missing token', { status: 401 })

    const secret = env.AUTH_SECRET
    if (!secret) return new Response('server misconfigured', { status: 500 })

    const payload = await verifyChatToken(token, secret)
    if (!payload) return new Response('invalid token', { status: 401 })

    const parts = url.pathname.split('/').filter(Boolean)
    const instanceName = parts[2] ? decodeURIComponent(parts[2]) : ''
    if (instanceName !== payload.email) {
      return new Response('forbidden', { status: 403 })
    }

    const routed = await routeAgentRequest(request, env)
    return routed ?? new Response('agent not found', { status: 404 })
  }

  const fetchHandler = next.fetch
  if (!fetchHandler) return new Response('no handler', { status: 500 })
  return fetchHandler.call(next, request as Parameters<typeof fetchHandler>[0], env, ctx)
}
