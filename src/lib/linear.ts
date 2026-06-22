// Linear integration for beta feedback. The Worker files one issue per feedback
// submission via the Linear GraphQL API, embedding the screenshot when present.
// Configured entirely by secrets — if LINEAR_API_KEY / LINEAR_TEAM_ID are unset
// the helper no-ops, so feedback capture never depends on Linear being wired.

export type LinearEnv = {
  LINEAR_API_KEY?: string
  LINEAR_TEAM_ID?: string
  LINEAR_LABEL_ID?: string // optional single label applied to every feedback issue
  LINEAR_STATE_ID?: string // optional workflow state (else the team default — Backlog)
}

export type FeedbackForIssue = {
  id: string
  email: string
  message: string
  page_url?: string | null
  user_agent?: string | null
  image_key?: string | null
  created_at: number
}

export type FeedbackImage = { bytes: Uint8Array; contentType: string; filename: string }
export type CreatedIssue = { id: string; identifier: string; url: string }

const GQL = 'https://api.linear.app/graphql'

const ISSUE_CREATE = `mutation Create($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`

const FILE_UPLOAD = `mutation Upload($contentType: String!, $filename: String!, $size: Int!) {
  fileUpload(contentType: $contentType, filename: $filename, size: $size) {
    success uploadFile { uploadUrl assetUrl headers { key value } }
  }
}`

async function gql(key: string, query: string, variables: unknown): Promise<unknown> {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: key },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`linear ${res.status}`)
  return res.json()
}

// Upload an image to Linear's asset store and return its public asset URL (for
// embedding as markdown). Two steps: ask Linear for a signed upload URL, then
// PUT the bytes with the headers it hands back. Returns null on any failure.
export async function uploadImageToLinear(
  key: string,
  img: FeedbackImage,
): Promise<string | null> {
  try {
    const json = (await gql(key, FILE_UPLOAD, {
      contentType: img.contentType,
      filename: img.filename,
      size: img.bytes.byteLength,
    })) as {
      data?: {
        fileUpload?: {
          success?: boolean
          uploadFile?: { uploadUrl: string; assetUrl: string; headers: { key: string; value: string }[] }
        }
      }
    }
    const uf = json.data?.fileUpload?.uploadFile
    if (!json.data?.fileUpload?.success || !uf) return null
    const headers = new Headers({ 'content-type': img.contentType })
    for (const h of uf.headers) headers.set(h.key, h.value)
    // Cast the view to a fresh ArrayBuffer-backed body fetch accepts cleanly.
    const put = await fetch(uf.uploadUrl, { method: 'PUT', headers, body: img.bytes as BodyInit })
    return put.ok ? uf.assetUrl : null
  } catch {
    return null
  }
}

function buildDescription(fb: FeedbackForIssue, assetUrl: string | null): string {
  return [
    fb.message,
    '',
    assetUrl ? `![screenshot](${assetUrl})` : null,
    '---',
    `**From:** ${fb.email}`,
    fb.page_url ? `**Page:** ${fb.page_url}` : null,
    `**When:** ${new Date(fb.created_at).toISOString()}`,
    fb.user_agent ? `**UA:** ${fb.user_agent}` : null,
    `**Feedback ID:** \`${fb.id}\``,
  ]
    .filter((l): l is string => l != null)
    .join('\n')
}

// Create a Linear issue for one feedback row, embedding the screenshot when
// given. Returns the created issue, or null when Linear is not configured or the
// call fails (caller treats null as "skip").
export async function createLinearFeedbackIssue(
  env: LinearEnv,
  fb: FeedbackForIssue,
  image?: FeedbackImage | null,
): Promise<CreatedIssue | null> {
  const key = env.LINEAR_API_KEY
  const teamId = env.LINEAR_TEAM_ID
  if (!key || !teamId) return null

  const assetUrl = image ? await uploadImageToLinear(key, image) : null
  const firstLine = (fb.message.split('\n')[0] ?? '').trim() || 'Beta feedback'
  const title = `Feedback: ${firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine}`
  const input: Record<string, unknown> = {
    teamId,
    title,
    description: buildDescription(fb, assetUrl),
  }
  if (env.LINEAR_LABEL_ID) input.labelIds = [env.LINEAR_LABEL_ID]
  if (env.LINEAR_STATE_ID) input.stateId = env.LINEAR_STATE_ID

  try {
    const json = (await gql(key, ISSUE_CREATE, { input })) as {
      data?: { issueCreate?: { success?: boolean; issue?: CreatedIssue } }
    }
    const issue = json.data?.issueCreate?.issue
    return issue && json.data?.issueCreate?.success ? issue : null
  } catch {
    return null
  }
}
