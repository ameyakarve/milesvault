# Home card redesign — backlog

The Vault home cards (credit cards, reward programmes, "everything else") read as
flat text-on-a-box list rows. This is the backlog to make them feel like designed
cards. Worked one item at a time. Source tile: `CreditCardCard` in
`src/app/(frontend)/vault/vault-view.tsx` (monogram + name + ··last4 + big mono
balance + "90d spend" + hover arrow on a bordered box).

## Open direction decisions (answer before/while building)
- [ ] **Visual direction** — monochrome-refined vs branded card-art vs hybrid (drives everything below).
- [ ] **Credit limit data** — add a per-card limit (enables utilization, the most "card-y" signal) or skip? Not in the ledger today.
- [ ] **Network data** — is the card network (Visa/MC/Amex/RuPay) in the KG, or does it need adding?

## Phase 1 — cheap, high-impact
- [ ] **Label the hero number** — "Outstanding" / "In credit" / "You owe", not a bare balance.
- [ ] **State-based color** — owed (neutral/amber) · in-credit (green) · overdue (red); differentiate a paid-off card from a debt-laden one.
- [ ] **Reward chip from the KG** — "10% dining cashback" / "earns <points>" surfaced on the tile (it's why the card exists).
- [ ] **Issuer/network accent** — a per-issuer color stripe/mark + network badge (Visa/MC/Amex/RuPay) corner.
- [ ] **Spend sparkline / mini-bar** — replace the bare "90d 12,340" with a 90d trend.
- [ ] **Last-4 as card formatting** — `•••• 1234` instead of the quiet `··suffix`.

## Phase 2 — medium
- [ ] **Card-art header band** — subtle gradient/stripe header, faux chip, "plastic" feel.
- [ ] **Quick actions on hover/long-press** — Update balance · Upload statement · Pay.
- [ ] **Needs-attention dot** — an unreviewed statement for this card flags the tile.
- [ ] **Cycle / due context** — "since last statement" badge or progress toward the statement date (we have balance-assertion cycles).
- [ ] **Reward accrued this cycle** — the `Assets:Receivable:<issuer>` cashback / points earned, as a positive number.
- [ ] **Trend arrow** — owed up/down vs last cycle.

## Phase 3 — ambitious
- [ ] **Utilization bar** — needs credit limits.
- [ ] **Wallet-stack hero** — top cards fanned/stacked, the rest a denser list.
- [ ] **Per-issuer theming system** — tokens for issuer brand colors, applied consistently.
- [ ] **Sort/group controls** — by balance / due-soon / issuer (currently alphabetical).

## Holistic / cross-cutting
- [ ] **One language across all three clusters** (cards, programmes, everything-else) — one system, types still distinguishable.
- [ ] **Share tokens with the KPI strip** so the page reads as composed.
- [ ] **Accessibility** — state encoded by more than color; dark-mode parity; contrast on any gradient.
