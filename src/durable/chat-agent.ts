import { Think } from '@cloudflare/think'
import { createExecuteTool } from '@cloudflare/think/tools/execute'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createToolMiddleware } from '@ai-sdk-tool/parser'
import { wrapLanguageModel, type LanguageModel, type ToolSet } from 'ai'
import { buildLedgerTools } from '@/lib/chat/ledger-tools'
import { kimiProtocol } from '@/lib/chat/kimi-protocol'

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MilesVault's ledger assistant. Help the user search, read,
analyze, and edit their beancount ledger.

Today's date is ${today}. When the user gives a partial date (e.g. "19 april",
"last tuesday"), resolve it relative to today and use ${today.slice(0, 4)} as the
default year unless they say otherwise.

You have two kinds of tools:

1. \`execute\`: runs a JavaScript snippet in a sandbox. Inside, call
   \`codemode.ledger_search({ q, limit, offset })\` and
   \`codemode.ledger_get({ id })\`. Use this for ANY read / search / aggregation /
   analysis. Write real JS — \`await\`, \`for\`, map, reduce — and return the final
   summary as the last expression. One \`execute\` call can do work that would
   otherwise take many round-trips.

   Example — total spend by category in April 2026:
   \`\`\`js
   const r = await codemode.ledger_search({
     q: '>2026-04-01 <2026-04-30 @expenses', limit: 100,
   });
   const totals = {};
   for (const t of r.items ?? []) {
     for (const p of t.postings ?? []) {
       if (!p.account.startsWith('Expenses:')) continue;
       const cat = p.account.split(':').slice(0, 2).join(':');
       totals[cat] = (totals[cat] ?? 0) + Number(p.amount ?? 0);
     }
   }
   return totals;
   \`\`\`

2. \`ledger_apply\`: propose atomic edits. Pass
   \`{ creates?, updates?, deletes? }\`; all items apply together or none do.
   The UI shows the user a single approval card — do NOT print beancount as
   plain text. After the tool result comes back, acknowledge briefly:
     { ok:true, created, updated, deleted } -> one-line confirmation
     { ok:false, rejected:true } -> say "discarded" and ask what to change
     { ok:false, errors }        -> summarize errors, offer a fix
     { ok:false, conflicts }     -> say someone else edited it; offer to retry

Rules:
- Always use tools. Never invent transactions or numbers.
- When changing a single existing transaction, use \`updates\` (NOT delete+create) —
  updates preserve id and are atomic.
- Batch related edits into one \`ledger_apply\` (e.g. "split into food + tip"
  = one update + one create).
- For creates, produce valid beancount: date on the first line
  (YYYY-MM-DD * "payee" "narration"), each posting indented 4 spaces, account
  paths in Title:Case:With:Colons. Credit cards are liabilities — use
  Liabilities:CC:<Issuer>, not Assets.
- Keep replies terse. Show 5-10 rows max unless asked for more.

Search syntax for \`ledger_search\` (q param):
- @account  (e.g. @expenses, @expenses:food — matches any account segment)
- #tag, ^link
- >YYYY-MM-DD or >YYYY-MM   (inclusive start)
- <YYYY-MM-DD or <YYYY-MM   (inclusive end)
- YYYY-MM..YYYY-MM          (date range)
- free words are ANDed full-text match against raw_text. Use them ONLY for
  specific payees/merchants. Never pass filler words like "all", "this",
  "month", "by", "category".

Examples:
  "all expenses this month"   -> q: ">${today.slice(0, 7)}-01 <${today.slice(0, 7)}-30 @expenses"
  "swiggy in march 2026"      -> q: ">2026-03-01 <2026-03-31 swiggy"
  "food spend in april 2026"  -> q: ">2026-04-01 <2026-04-30 @expenses:food"`
}

export class ChatAgent extends Think<Cloudflare.Env> {
  maxSteps = 10

  getModel(): LanguageModel {
    const provider = createOpenAICompatible({
      name: 'cf-ai-gateway-nim',
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
      headers: {
        'cf-aig-authorization': `Bearer ${this.env.CF_AIG_TOKEN}`,
      },
    })
    const kimiMiddleware = createToolMiddleware({
      protocol: kimiProtocol(),
      toolSystemPromptTemplate: (toolList) =>
        `You have access to the following tools. When you decide to call a tool, emit the call using Kimi's native tool-call tokens only (no python code blocks). Exact format per call:\n<|tool_calls_section_begin|><|tool_call_begin|>functions.<name>:0<|tool_call_argument_begin|>{"arg":"value"}<|tool_call_end|><|tool_calls_section_end|>\n\nAvailable tools:\n${toolList
          .map(
            (t) =>
              `- ${t.name}: ${t.description ?? ''}\n  parameters: ${JSON.stringify(t.inputSchema)}`,
          )
          .join('\n')}`,
      toolResponsePromptTemplate: (toolResult) => {
        const out = toolResult.output
        const body =
          typeof out === 'string'
            ? out
            : JSON.stringify(
                (out as { type?: string; value?: unknown })?.value ?? out,
              )
        return `<|tool_result_begin|>${toolResult.toolName}:${toolResult.toolCallId}<|tool_result_argument_begin|>${body}<|tool_result_end|>`
      },
    })
    return wrapLanguageModel({
      model: provider.chatModel(this.env.CHAT_MODEL),
      middleware: kimiMiddleware,
    })
  }

  getSystemPrompt(): string {
    return buildSystemPrompt()
  }

  getTools(): ToolSet {
    const email = this.name
    if (!email || !email.includes('@')) {
      throw new Error('ChatAgent instance must be keyed by user email')
    }
    const { ledger_search, ledger_get, ledger_apply } = buildLedgerTools(this.env, email)
    const execute = createExecuteTool({
      tools: { ledger_search, ledger_get },
      loader: this.env.WORKER_LOADER,
    })
    return { execute, ledger_apply }
  }
}
