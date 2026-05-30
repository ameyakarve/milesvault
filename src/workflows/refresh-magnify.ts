import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import {
  buildMagnifyDoc,
  renderMagnifyYaml,
  type MagnifyApiResponse,
} from '@/lib/vouchers/magnify-transform'

const MAGNIFY_INVENTORY_URL =
  'https://api.magnify.club/api/giftcard/public/inventory?limit=2000&offset=0'

const R2_KEY = 'vouchers/magnify.yaml'

// Daily refresh of the Magnify catalog. Three durable steps so any one can
// retry independently (the API call, the YAML rendering, the R2 write).
// Workflow steps' return values are persisted by the runtime — keep them
// JSON-serializable.
export class RefreshMagnifyWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  Record<string, never>
> {
  async run(_event: WorkflowEvent<Record<string, never>>, step: WorkflowStep) {
    const inventory = await step.do(
      'fetch-inventory',
      { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } },
      async () => {
        const res = await fetch(MAGNIFY_INVENTORY_URL, {
          headers: { accept: 'application/json' },
        })
        if (!res.ok) {
          throw new Error(`magnify api ${res.status}`)
        }
        const body = (await res.json()) as MagnifyApiResponse
        if (body.status !== 'success' || !Array.isArray(body.data)) {
          throw new Error(`magnify api: unexpected payload`)
        }
        return body.data
      },
    )

    const yamlText = await step.do('build-yaml', async () => {
      const doc = buildMagnifyDoc(inventory, new Date().toISOString())
      return renderMagnifyYaml(doc)
    })

    const pushed = await step.do(
      'put-to-r2',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' } },
      async () => {
        // Skip the PUT if the byte-for-byte content is identical to what's
        // already in the bucket. R2 PUTs are cheap but a no-op write would
        // still bump the object's etag/uploaded timestamp, which we'd rather
        // not do (downstream cache-busting reads off etag).
        const current = await this.env.R2.get(R2_KEY)
        if (current) {
          const existing = await current.text()
          if (existing === yamlText) {
            return { changed: false }
          }
        }
        const result = await this.env.R2.put(R2_KEY, yamlText, {
          httpMetadata: { contentType: 'text/yaml; charset=utf-8' },
          customMetadata: {
            fetched_at: new Date().toISOString(),
            brand_count: String(inventory.length),
          },
        })
        return { changed: true, etag: result?.etag ?? null }
      },
    )

    return {
      brand_count: inventory.length,
      changed: pushed.changed,
      etag: 'etag' in pushed ? pushed.etag : null,
    }
  }
}
