import { tool } from 'ai'
import { showAwardOptionsSchema } from '../../../agent-ui-schemas'

// DISPLAY tool — renders the interactive award-options card on the client.
// Unlike the editor's suspending gen-UI tools (draft_transaction/clarify), this
// does NOT wait on the user: it is a plain `tool` with a trivial execute, so the
// agent's turn never blocks. The card self-fetches its data from
// /api/concierge/award-options using these args; the model receives only
// `{ ok: true }`, NEVER the rows. That is the point — it cannot trim, reorder,
// or hallucinate options it never sees. The agent's only job is to pass the
// right { origin, destination, source }.
export function showAwardOptionsTool() {
  return tool({
    description:
      'Render the interactive award-options card to fly a city pair with a card. ' +
      'Pass { origin, destination, source } where source is the funding card or ' +
      'currency (e.g. "Axis Magnus Burgundy"). The card shows EVERY routing × ' +
      'programme × cabin, already costed in the card’s points, with client-side ' +
      'filters and the transfer path per row. PREFER this over award_options + ' +
      'prose for any open-ended "best way to fly X→Y with <card>" question — it is ' +
      'exhaustive and cannot drop options. After calling it, do NOT restate the ' +
      'table in prose; the card is the answer. Add at most one sentence of context.',
    inputSchema: showAwardOptionsSchema,
    execute: async () => ({ ok: true as const }),
  })
}
