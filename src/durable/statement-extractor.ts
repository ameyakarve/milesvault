import { createWorkersAI } from 'workers-ai-provider'
import { streamText } from 'ai'
import { buildStatementExtractionPrompt } from './agent-prompt'
import { TaskWorker } from './agent-tasks'

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'
const EXTRACTION_TIMEOUT_MS = 240_000

type Snapshot = {
  today: number
  accounts: Array<{
    account: string
    currencies: string[]
    open_date: number
    close_date: number | null
  }>
  row_counts: Record<string, number>
  sample_txns: string
  schema_ddl: string
}

// Pre-staged by POST /api/statements before the chat agent ever decides to
// act on the upload. owner_email gates dispatch; the bytes never touch the
// parent LedgerDO.
type PreparedStatement = {
  ownerEmail: string
  filename: string
  text: string
}

// Supplied by the LedgerDO at dispatch — the ledger context the model needs to
// extract against (open accounts, schema, samples).
type ExtractContext = {
  snapshot: Snapshot
}

// A one-shot statement-extraction sub-agent. The durable lifecycle (persist
// before run, fiber + recovery, push-back, status() poll fallback, exactly-
// once delivery on the parent) lives in TaskWorker; this class only supplies
// the actual extraction work. Result is the raw Beancount text — stored and
// pushed as-is (no JSON envelope), so serializeResult is identity.
export class StatementExtractorDO extends TaskWorker<
  Cloudflare.Env,
  PreparedStatement,
  ExtractContext,
  string
> {
  protected override fiberName = 'extract'
  protected override logTag = '[extractor]'

  protected override parentNamespace(): DurableObjectNamespace {
    return this.env.LEDGER_DO as unknown as DurableObjectNamespace
  }

  protected override authorizeDispatch(
    prepared: PreparedStatement | null,
    parentName: string,
  ): boolean {
    return prepared?.ownerEmail === parentName
  }

  // Beancount is already text; push it verbatim rather than JSON-wrapping it.
  protected override serializeResult(text: string): string {
    return text
  }

  // Thin alias preserving the /api/statements contract.
  async ingest(opts: {
    statementId: string
    ownerEmail: string
    filename: string
    text: string
  }): Promise<{ ok: true } | { ok: false; error: 'already_ingested' }> {
    const r = await this.prepare(opts.statementId, {
      ownerEmail: opts.ownerEmail,
      filename: opts.filename,
      text: opts.text,
    })
    if (!r.ok) return { ok: false, error: 'already_ingested' }
    return { ok: true }
  }

  protected override async runTask(
    prepared: PreparedStatement,
    context: ExtractContext,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const baseSystem = buildStatementExtractionPrompt(
      context.snapshot,
      prepared.filename,
    )
    // streamText emits free-form text. Beancount is already a textual format,
    // so we ask for raw entries rather than a JSON envelope — simpler for the
    // model, no escape-the-multiline-string trap.
    const system =
      baseSystem +
      `\n\n---\n\n# Output format (strict)\n\n` +
      `Emit the extracted transactions as raw Beancount entries, nothing ` +
      `else. Rules:\n\n` +
      `- One entry per transaction. Each entry starts with a \`YYYY-MM-DD\` ` +
      `date at column 0 (no leading whitespace), followed by postings on ` +
      `indented lines.\n` +
      `- Separate consecutive entries with a single blank line.\n` +
      `- No prose, no preamble, no summary, no closing remarks, no fenced ` +
      `code blocks, no comments narrating what you found. The reply is ` +
      `only Beancount.\n` +
      `- If the statement genuinely has nothing to extract, reply with an ` +
      `empty string. Do NOT invent placeholder entries.`
    console.log(
      `[extractor] extraction start filename=${prepared.filename} bytes=${prepared.text.length}`,
    )
    const timeout = AbortSignal.timeout(EXTRACTION_TIMEOUT_MS)
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    const workersai = createWorkersAI({ binding: this.env.AI })
    const model = workersai(MODEL_ID, {
      // The Workers AI schema key is `thinking`, not `enable_thinking` (the
      // workers-ai-provider TS surface mistranslates it). Default is true, so
      // we must pass false explicitly to skip the reasoning trace.
      chat_template_kwargs: { thinking: false } as never,
    })
    const { fullStream } = streamText({
      model,
      system,
      prompt: prepared.text,
      abortSignal,
    })
    let textBuf = ''
    for await (const part of fullStream) {
      if (part.type === 'text-delta') {
        textBuf += part.text
      } else if (part.type === 'error') {
        throw part.error instanceof Error
          ? part.error
          : new Error(String(part.error))
      }
    }
    console.log(`[extractor] extraction produced textBytes=${textBuf.length}`)
    return textBuf
  }
}
