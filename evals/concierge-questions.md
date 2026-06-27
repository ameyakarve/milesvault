# Concierge question bank

Questions the concierge (knowledge graph + the user's ledger) should ideally
answer well. This is the source list we'll build an eval from later — for now
it's just the target set, grouped by capability.

Conventions:
- **Graph questions** use real, public points-world names (cards, programmes,
  airlines) — that's KG reference content, not anyone's private data.
- **Personal / ledger questions** are written as generic templates ("my cards",
  "last month"); they must never bake in a specific person's holdings, routes,
  or amounts.
- The note under each group is what it exercises (edges / tools / answer shape),
  to anchor the eval we write off this.

---

## 1. Transfer partners & ratios

*Expected: construct a **`/points` deep link** (the path-to-points screen) for the programme in question — the screen visualises the partners + ratios. The concierge builds the URL; it does NOT recite ratios in chat.*

- **What does Marriott Bonvoy transfer to, and at what ratios?**
  - *Pre-setup:* Marriott `TRANSFERS` edges in the KG with ratios.
  - *Expected:* `/points` deep link prefilled to Marriott Bonvoy (partners + ratios shown on screen, not recited).
- **How do I get Avios from my cards?**
  - *Pre-setup:* inbound paths to Avios in the KG; user's held cards (`ledger_snapshot`).
  - *Expected:* `/points` deep link targeting Avios.
- **What's the transfer ratio from Amex Membership Rewards to KrisFlyer?**
  - *Pre-setup:* `TRANSFERS` edge MR → KrisFlyer in the KG with ratio.
  - *Expected:* `/points` deep link (Membership Rewards); ratio shown on screen.
- **how long does a smartbuy to krisflyer transfer take?**
  - *Pre-setup:* `transfer_time` on the SmartBuy → KrisFlyer `TRANSFERS` edge.
  - *Expected:* `/points` deep link (SmartBuy/KrisFlyer); timing shown on screen.
- **Does Marriott Bonvoy give a transfer bonus?**
  - *Pre-setup:* transfer-bonus note in the KG (Marriott node / `TRANSFERS` edge body).
  - *Expected:* `/points` deep link to Marriott Bonvoy.
- **how do I get Qatar miles?**
  - *Pre-setup:* inbound paths to Qatar's programme (Avios / Privilege Club) in the KG.
  - *Expected:* `/points` deep link targeting Qatar.
- **what is the best card for avios?**
  - *Pre-setup:* cards that earn/reach Avios in the KG.
  - *Expected:* `/points` deep link (Avios).

## 2. Card earning (what a card earns into)

*Exercises: `EARNS_INTO` (card → programme, per-currency). Pick the right tier currency.*

- What does the HDFC Infinia earn into?
- Which Indian credit cards earn Avios directly?
- What currency does the Axis Atlas earn, and what does it transfer to?
- What's the difference in what Axis Magnus vs Atlas vs Olympus earn?
- Which cards earn into Marriott Bonvoy in India?

## 3. Issuers, networks, co-brands

*Exercises: `ISSUED_BY`, `ON_NETWORK`, brand/issuer nodes.*

- Which banks issue American Express-network cards in India?
- What network is the HDFC Diners Club Black on?
- Who issues the Tata Neu cards?
- Which Indian co-brand cards are tied to an airline?

## 4. Card selection by spend / benefit

*Exercises: reading a card's earning rules + caps + exclusions from its body. The hard case (MCC-style categories, business-card exceptions).*

- Best card for fuel spends in India?
- Which cards still earn rewards on rent / property payments?
- Best card for forex spends with the lowest markup?
- Which cards earn on income tax and GST payments?
- Best card for airport lounge access (domestic + international)?
- Which cards earn accelerated points on grocery, and what's the monthly cap?
- Best premium card for hotel stays / milestone vouchers?

## 5. Airlines, alliances & bookability

*Exercises: `alliance` membership, `BOOKS_ON` / `OWN_METAL`, partner reachability.*

- Which alliance is Qatar Airways in?
- What airlines can I book with Avios?
- Can I book ANA flights with Virgin Atlantic points?
- Which Star Alliance carriers fly out of India?
- What programmes can book Singapore Airlines award seats?

## 6. Award flights → Explorer link

*Exercises: `show_award_options` deep link. Must hand off to `/explore` with resolved IATA, not price in chat.*

- Cheapest way to fly Delhi to Tokyo in business class with points?
- Best way to get to London from Bangalore on miles?
- How many miles to fly Mumbai → New York in first?
- What are my options to fly Hong Kong → Osaka on points?

## 7. Path to points → /points link

*Exercises: routing a target programme; `show_points_paths`-style deep link (to be built) or a grounded transfer walk.*

- How do I accumulate 60,000 KrisFlyer miles?
- What's the cheapest way to top up Avios from India?
- Which of my currencies can reach Aeroplan, and how?

## 8. Status & status match → /status-match link

*Exercises: status tiers, status-match chains; `/status-match` deep link.*

- How do I get oneworld Sapphire status?
- Can I match my hotel elite status from one chain to another?
- What's the fastest status-match path into Emirates Skywards Gold?

## 9. Hotel programmes & portfolios

*Exercises: hotel-chain nodes, brand portfolios, hotel↔airline transfers.*

- Which hotel brands are in World of Hyatt?
- Does Taj / IHCL have a points programme, and how do I earn it?
- Can I move hotel points to an airline, and which ones?

## 10. Buying points

*Exercises: `BUYS_INTO` (fiat → programme), cash-per-point math.*

- Can I buy Avios with cash, and roughly what does it cost per point?
- Is buying Hyatt points ever worth it for a specific redemption?

## 11. My cards / holdings (cross-domain)

*Exercises: ledger × graph join — codemode. Must ground in the user's actual held cards, never hypothesize ("if you hold X").*

- Which of my cards transfer to Turkish Airlines?
- What's my best card for dining?
- Do I have enough Avios for a one-way business award to Europe?
- Across my cards, what's the best way to reach KrisFlyer?
- Which of my cards earns the most on online shopping?

## 12. Ledger analytics

*Exercises: `query_sql` over the user's ledger. Cite the period; don't mix currencies.*

- How much did I spend on flights last quarter?
- What are my points balances across all programmes?
- What's my average monthly credit-card spend this year?
- Show my Marriott stays in 2026.

## 13. Ambiguity → ask, don't guess

*Exercises: `ask_user` only when the answer materially changes.*

- "What's the best card?" (no spend category given)
- "How do I get to Tokyo?" (no origin, no cabin, no currency)

## 14. Out of scope → decline cleanly

*Exercises: staying in-domain; a clean refusal, no fabrication.*

- What's the weather in Tokyo next week?
- Should I buy this stock?
- Plan my full itinerary including restaurants and visas.
