# Assistant surfaces — DECIDED: two surfaces, split by capability envelope

Status: **decided (owner call, 2026-06-10).** Supersedes the merge options
below and amends `experience.md` §7. The original "One Assistant" merge is
dropped in favour of two deliberately distinct surfaces.

## The model

Split by **capability envelope, not topic**:

| Surface | Envelope | Lives | Does |
|---|---|---|---|
| **Ledger chat** | Full gen-UI, web only | with the Journal (`/editor`), on `ChatDO` (`ledger` ↔ `statement`) | everything that *writes*: drafting, statement processing, approve/reject. The trust contract's interactive moments belong here. |
| **Assistant** | Text + image, channel-portable | `/concierge` today (rename candidate: "Assistant"), on `ConciergeDO` (`graph-walker` ↔ `analyst`) | Q&A over the knowledge graph *and* the ledger (analyst is read-only SQL), planning, capture intake. |

Because the Assistant is text/image by construction, it runs **identically on
web and WhatsApp/Telegram/Discord** — no per-channel degradation logic; the
surface is the envelope. A bot adapter is a thin transport in front of the
same ConciergeDO chat.

## The bridge

The Assistant (and any bot) **never commits**. Anything that should become a
ledger write lands as a **capture in the Inbox** (image/PDF/text →
`capture_items`, source `bot`/`email`/`upload`), and "Review in chat" carries
it into the Ledger chat for approval. Writes-over-bots, if ever, arrive later
as a reply protocol — they are not needed for the surfaces to be useful.

## Why this beats the merge

- The old confusion ("which chat do I use?") was a *legibility* problem: two
  surfaces that both looked like generic chat. Making one clearly the
  ledger workbench and the other clearly the portable ask-anything assistant
  resolves it without a router.
- Zero agent-architecture change: DOs, registries, handoffs all stay as-is.
- The bot channel ships against today's ConciergeDO with no migration later.

## What follows (in rough order)

1. Framing pass: rename `/concierge` → Assistant in nav/copy; the Ledger
   chat is presented as part of the Journal, not a peer chat.
2. ~~Assistant capture intake (image/PDF → capture)~~ — **parked**
   (owner call, 2026-06-10); pairs with R2 raw-artifact work when revived.
3. Bot adapter (read-only Q&A first), account↔bot pairing per
   `experience.md` §15.
4. Context injection (screen state → turn context) applies to each surface
   independently and survives this decision unchanged.

---

## Appendix — the superseded merge options (for the record)

**A. ChatDO hosts all four agents.** Was the recommendation before the
owner call: shared tool modules + existing KB binding made it cheap. Rejected
in favour of the two-surface model: the merge solved brain-picking with a
router, the split solves it with legibility, and the split is what the bot
constraint actually wants.

**B. Cross-DO routing.** Framework machinery (streaming proxy, split
history) to preserve a split that has no data-locality reason. Rejected.

**C. UI-only unification.** Client-side classification of which socket to
use; loses context exactly when the user mixes concerns. Rejected.
