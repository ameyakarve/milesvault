import { tool } from 'ai'
import { showAwardOptionsSchema } from '../../../agent-ui-schemas'

// DISPLAY tool — emits a link card into the chat that opens the dedicated
// /explore Award Explorer (origin + destination prefilled). It is a plain `tool`
// with a trivial execute, so the agent's turn never blocks; the model receives
// only `{ ok: true }` and never sees, prices, or ranks any options. ALL award
// pricing, filtering and slicing lives on the /explore page now — the agent's
// only job is to pass the right { origin, destination, source }.
export function showAwardOptionsTool() {
  return tool({
    description:
      'Show a link to the Award Explorer (/explore) for flying a city pair. ' +
      'Pass { origin, destination, source } — origin/destination are IATA codes ' +
      'and source is the funding card or currency the user named (e.g. "Axis ' +
      'Magnus Burgundy"), shown as context. The Explorer page computes EVERY ' +
      'routing × programme × cabin with client-side filters; you do NOT price ' +
      'awards yourself. PREFER this for any "best / cheapest way to fly X→Y" ' +
      'question. After calling it, add at most one short sentence — do NOT list ' +
      'options or name point figures in prose; the link is the answer.',
    inputSchema: showAwardOptionsSchema,
    execute: async () => ({ ok: true as const }),
  })
}
