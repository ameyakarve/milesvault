import { dynamicTool, type ToolExecuteFunction } from 'ai'
import { addCardInputSchema } from '../../../agent-ui-schemas'

// CLIENT tool — suspends until the user picks a card in the gen-UI picker.
// The component searches the knowledge graph (cc nodes), shows the derived
// issuer / reward pool / ticker / earn rate, and collects optional last-4 and
// a current points balance. The tool result returns the confirmed selection:
// { card, slug, issuer, liability_account, wallet_account, pool_ticker,
//   last4?, opening_points? } — draft the open directives (and a points
// balance assertion when opening_points is present) via draft_transaction.

const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<
  unknown,
  unknown
>

export function addCardTool() {
  return dynamicTool({
    description:
      'Show the card picker when the user wants to add/track a NEW credit card. Optionally pass `candidates` you already resolved from the KG. The user selects the card and confirms; the tool result carries the canonical accounts (liability + rewards wallet), the pool ticker, optional last-4 and an optional current points balance — then draft the `open` directives (and the points balance assertion if given) via draft_transaction.',
    inputSchema: addCardInputSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
