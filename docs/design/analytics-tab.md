# Analytics tab — design contract

The analytics tab on the per-account view (`/ledger/<account>?ccy=&tab=analytics`) uses **one layout for every account kind**. The grid, chart primitives, and chrome stay fixed; only the data filling each slot varies by kind.

This is a contract, not a sketch. Anything that doesn't fit the contract doesn't ship on this tab.

## The invariant grid

```
┌─────────────────────────────────────────────────────────────┐
│  A — KPI strip          [3–4 stat tiles, same shape]        │
├──────────────────────────────────┬──────────────────────────┤
│                                  │                          │
│  B — Primary trend               │  C — Composition         │
│  (big chart over time)           │  (horizontal-bar list)   │
│                                  │                          │
├──────────────────────────────────┴──────────────────────────┤
│  D — Notable events                                         │
│  (bordered rows, statement-row component reused)            │
└─────────────────────────────────────────────────────────────┘
[time-range chips: 1M / 3M / YTD / 12M / All]   [Δ vs prior ⇄]
```

The time-range chips and the "compare vs prior period" toggle live in the same position on every variant. The right-side AI sidebar and the bottom status bar are unchanged from the rest of the app shell.

## Slot contract

| Slot | Primitive | Question it always answers |
|---|---|---|
| **A** | 3–4 mono-number tiles, optional Δ chip per tile | Where am I now? |
| **B** | one chart spanning the main column: line **or** bar **or** line+bar overlay | How did I get here over time? |
| **C** | horizontal-bar list, max 8 rows, "+N more" footer when truncated | What's it made of? |
| **D** | row list reusing the statement-row component | What stood out? |

## Per-kind fill

Same four slots, different data per account kind.

| Kind | A — KPIs | B — Trend | C — Composition | D — Notable events |
|---|---|---|---|---|
| `Assets:Bank` / `Cash` | balance · MoM Δ · avg monthly net | balance line | top counter-accounts | salary credits, large debits |
| `Liabilities:CC` | owed · utilization % · avg cycle spend | balance line + monthly-spend bars | top expense categories | statement closes, due dates, interest paid |
| `Expenses:*` | YTD · MoM · avg/month | monthly bars | top payees / sub-categories | first-time payees, outliers |
| `Income:*` | YTD · MoM · sources count | monthly bars | source mix | bonuses, raises |
| `Assets:Rewards:Points` | balance · accrued YTD · expiring soon | balance line + accrual bars | top earning sources | redemptions, expiries |
| `Assets:Investments` / `Retirement` | value · cost basis · unrealized | value line vs cost-basis line | by holding | contributions, large moves |

When a kind doesn't have meaningful data for a slot (e.g. `Cash` has no counter-account distribution), render the empty state for that slot — do not collapse the layout.

## Consistency rules

These are hard rules. Bend them and the tab loses its meaning.

1. **Four slots only.** No kind gets a 5th tile, a 2nd chart, or an extra column. If it doesn't fit A/B/C/D, it doesn't go on this tab.
2. **Three chart primitives only**: line, bar, line+bar overlay. No pies, no treemaps, no scatter, no donuts.
3. **C is always a horizontal-bar list.** Not a pie. Same row component everywhere.
4. **D is always the statement-row component.** Reused from the Statement tab, not redrawn.
5. **Time-range chips and compare toggle live in the same spot on every variant.** Right side, above slot A.
6. **Color discipline**: `accent-teal #00685f` for accents, `rose-600` for negative deltas. No per-kind palette.
7. **Typography**: mono for all numbers and account paths, sans for labels and titles. Same scale as the rest of the app.
8. **Empty state per slot**: each slot can independently render "Not enough data yet" without breaking the grid.

## Out of scope (v1)

- Cross-account analytics (portfolio-level dashboards). Lives on a separate page later, not on the per-account tab.
- Custom user-defined charts. The four slots are enough for v1.
- Date-range picker beyond the chip presets.
- Drill-down from a chart into a filtered statement view. Nice to have; not v1.
- Export to CSV / image. Add when there's demand.

## Open mock list

One Stitch mock per kind, all sharing the layout contract above:

- [ ] `analytics-bank` (Bank / Cash)
- [ ] `analytics-cc` (Liabilities:CC)
- [ ] `analytics-expense` (Expenses:\*)
- [ ] `analytics-income` (Income:\*)
- [ ] `analytics-rewards` (Assets:Rewards:Points)
- [ ] `analytics-investments` (Assets:Investments / Retirement)

Mock the Bank variant first as the layout reference. Mock the CC variant second to prove the slots hold under a kind that needs the line+bar overlay and a cycle-event list.
