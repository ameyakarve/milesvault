import { parseBeancount } from '@/lib/beancount'

export const POST = async (request: Request): Promise<Response> => {
  const contentType = request.headers.get('content-type') ?? ''
  let source: string

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as { source?: unknown }
    if (typeof body.source !== 'string') {
      return Response.json(
        { error: 'Expected JSON body { source: string }' },
        { status: 400 },
      )
    }
    source = body.source
  } else {
    source = await request.text()
  }

  const result = parseBeancount(source)
  return Response.json(result, { status: result.valid ? 200 : 422 })
}
