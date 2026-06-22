// Linear integration for beta feedback. The Worker files one issue per feedback
// submission via the Linear GraphQL API. Configured entirely by secrets — if
// LINEAR_API_KEY / LINEAR_TEAM_ID are unset the helper no-ops, so feedback
// capture never depends on Linear being wired.

export type LinearEnv = {
  LINEAR_API_KEY?: string
  LINEAR_TEAM_ID?: string
  LINEAR_LABEL_ID?: string // optional single label applied to every feedback issue
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

export type CreatedIssue = { id: string; identifier: string; url: string }

const ISSUE_CREATE = `mutation Create($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`

function buildIssue(fb: FeedbackForIssue): { title: string; description: string } {
  const firstLine = (fb.message.split('\n')[0] ?? '').trim() || 'Beta feedback'
  const title = `Feedback: ${firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine}`
  const description = [
    fb.message,
    '',
    '---',
    `**From:** ${fb.email}`,
    fb.page_url ? `**Page:** ${fb.page_url}` : null,
    `**When:** ${new Date(fb.created_at).toISOString()}`,
    fb.image_key ? `**Screenshot (R2):** \`${fb.image_key}\`` : null,
    fb.user_agent ? `**UA:** ${fb.user_agent}` : null,
    `**Feedback ID:** \`${fb.id}\``,
  ]
    .filter((l): l is string => l != null)
    .join('\n')
  return { title, description }
}

// Create a Linear issue for one feedback row. Returns the created issue, or null
// when Linear is not configured or the call fails (caller treats null as "skip").
export async function createLinearFeedbackIssue(
  env: LinearEnv,
  fb: FeedbackForIssue,
): Promise<CreatedIssue | null> {
  const key = env.LINEAR_API_KEY
  const teamId = env.LINEAR_TEAM_ID
  if (!key || !teamId) return null

  const { title, description } = buildIssue(fb)
  const input: Record<string, unknown> = { teamId, title, description }
  if (env.LINEAR_LABEL_ID) input.labelIds = [env.LINEAR_LABEL_ID]

  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: key },
      body: JSON.stringify({ query: ISSUE_CREATE, variables: { input } }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: { issueCreate?: { success?: boolean; issue?: CreatedIssue } }
    }
    const issue = json.data?.issueCreate?.issue
    return issue && json.data?.issueCreate?.success ? issue : null
  } catch {
    return null
  }
}
