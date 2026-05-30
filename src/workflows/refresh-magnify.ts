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
import { commitFileToArtifact } from '@/lib/vouchers/artifact-git'

const MAGNIFY_INVENTORY_URL =
  'https://api.magnify.club/api/giftcard/public/inventory?limit=2000&offset=0'

const ARTIFACT_REPO = 'milesvault-vouchers'
const ARTIFACT_PATH = 'magnify.yaml'

// Daily refresh of the Magnify catalog. Three durable steps so any one can
// retry independently (the API call, the YAML rendering, the git push).
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
      'push-to-artifact',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' } },
      async () => {
        const repo = await this.env.ARTIFACTS.get(ARTIFACT_REPO)
        // 900s = 15 min — generous window for the clone + push round-trip
        // (a few hundred ms in practice; if it spikes we'd rather the token
        // outlive the step than need to refresh mid-push).
        const { plaintext } = await repo.createToken('write', 900)
        const result = await commitFileToArtifact({
          repoUrl: repo.remote,
          token: plaintext,
          path: ARTIFACT_PATH,
          content: yamlText,
          message: `refresh: magnify (${inventory.length} brands)`,
        })
        return result
      },
    )

    return {
      brand_count: inventory.length,
      changed: pushed.changed,
      sha: pushed.sha ?? null,
    }
  }
}
