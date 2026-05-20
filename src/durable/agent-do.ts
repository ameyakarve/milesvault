import { DurableObject } from 'cloudflare:workers'
import { streamText, convertToModelMessages, stepCountIs, tool } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import { buildSystemPrompt } from './agent-prompt'
import type { LedgerDO } from './ledger-do'

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'

export type StoredMessage = {
  id: number
  role: 'user' | 'assistant' | 'system'
  parts: unknown
  created_at: number
}

export class AgentDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      role        TEXT    NOT NULL,
      parts_json  TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    )`)
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(id ASC)',
    )
    this.sql.exec(`CREATE TABLE IF NOT EXISTS profile (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`)
  }

  async list_messages(): Promise<StoredMessage[]> {
    return this.listMessages()
  }

  async clear_messages(): Promise<{ ok: true }> {
    this.sql.exec('DELETE FROM messages')
    return { ok: true }
  }

  async chat(
    messagesRaw: unknown,
    ledger: DurableObjectStub<LedgerDO>,
  ): Promise<Response> {
    const messages = messagesRaw as UIMessage[]
    // Persist any new user message(s) we haven't seen. The client sends the
    // full UI message list; we only persist tails we don't have on record.
    const stored = this.listMessages()
    const newClientMsgs = messages.slice(stored.length)
    for (const m of newClientMsgs) {
      if (m.role === 'user') this.persistMessage('user', m.parts)
    }

    const snapshot = await ledger.ledger_snapshot()
    const systemPrompt = buildSystemPrompt(snapshot)

    const workersai = createWorkersAI({ binding: this.env.AI })
    const model = workersai(MODEL_ID)

    const modelMessages: ModelMessage[] = await convertToModelMessages(messages)

    const sqlQueryTool = tool({
      description:
        'Run a read-only SQL query against the ledger SQLite. Engine-enforced read-only; use parameters; LIMIT aggressively.',
      inputSchema: z.object({
        sql: z.string().describe('SELECT or WITH statement only.'),
        params: z
          .array(z.union([z.string(), z.number(), z.null()]))
          .optional()
          .describe('Positional parameters bound to ? placeholders.'),
      }),
      execute: async ({ sql, params }) => {
        try {
          return await ledger.query_sql(sql, params ?? [])
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) }
        }
      },
    })

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: { sql_query: sqlQueryTool },
      stopWhen: stepCountIs(6),
      onFinish: ({ response }) => {
        for (const m of response.messages) {
          if (m.role === 'assistant') {
            const parts = Array.isArray(m.content)
              ? (m.content as unknown as UIMessage['parts'])
              : ([{ type: 'text', text: String(m.content) }] as unknown as UIMessage['parts'])
            this.persistMessage('assistant', parts)
          }
        }
      },
    })

    return result.toUIMessageStreamResponse()
  }

  private listMessages(): StoredMessage[] {
    const rows = this.sql
      .exec<{ id: number; role: string; parts_json: string; created_at: number }>(
        'SELECT id, role, parts_json, created_at FROM messages ORDER BY id ASC',
      )
      .toArray()
    return rows.map((r) => ({
      id: r.id,
      role: r.role as StoredMessage['role'],
      parts: JSON.parse(r.parts_json),
      created_at: r.created_at,
    }))
  }

  private persistMessage(role: StoredMessage['role'], parts: unknown): void {
    this.sql.exec(
      'INSERT INTO messages (role, parts_json, created_at) VALUES (?, ?, ?)',
      role,
      JSON.stringify(parts),
      Date.now(),
    )
  }
}
