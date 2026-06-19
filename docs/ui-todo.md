# UI / UX TODO — holistic critique backlog

Backlog from a holistic pass over all frontend screens (shell, Plan, Vault,
Editor, Concierge, Inbox/Statements, gen-UI cards, modals). Grouped by theme,
ordered roughly by impact. Checkboxes to tick as we go. File:line refs are
starting points, not exhaustive.

## P0 — high impact / likely bugs

- [x] **Add viewport meta** to `src/app/(frontend)/layout.tsx`. Done via `export const viewport` (width=device-width, initialScale 1, viewportFit cover, colorScheme light dark).
- [~] **Kill silent error swallowing (`.catch(() => {})`).** Infra built: `src/lib/fetch-json.ts` (`fetchJSON` throws with a usable message) + `src/components/shared/use-async-data.ts` (`useAsyncData` — loading/ready/error + abort + `reload`) + `CenteredState` now takes `onRetry` (role=alert). **Converted/handled:** explore (`transfer-sources`), points (`currencies`), status-match (`match-statuses`); vault main load (retry); account-overview (retry); inbox `deleteItem` (full-snapshot revert + inline alert) and `doRotate` (error surfaced). **Remaining:** `accounts-view.tsx:178–179`, vault secondary overlays (`vault-stats`/`account-names`/`captures`), `add-card.tsx` guide/account fetches, `update-balance-modal.tsx` targets load.
- [ ] **Nav state: `/accounts` is a Plan tab but not in `PLAN_ROUTES`** (`nav-rail.tsx:16`) — rail's Plan item doesn't activate on `/accounts`.
- [ ] **Pending-capture badges never re-poll** (`nav-rail.tsx`, `usePendingCaptures` fires once on mount). Subscribe to the existing `mv:captured` event (`global-capture.tsx:155`) to refresh.
- [ ] **`StatusBar` hardcodes `left-[48px]`** (`status-bar.tsx`) → mis-offset on mobile where the rail is hidden. Also "Parsed ✓" and "Beancount v2.3.5" are hardcoded and can't express an error.
- [ ] **`account-sheet.tsx` `Row` uses setState-during-render** (`:165–168`) — can loop in StrictMode; match the safer pattern in `journal-filter-bar.tsx:396–399`.
- [ ] **`version-watcher.tsx` leaks the `focus` listener** (`:35` — cleanup only removes `visibilitychange`).

## P1 — accessibility (recurring Level-A gaps)

- [ ] **No `aria-live` on either chat** (`editor/chat.tsx:439`, `concierge/chat.tsx`) — screen readers silent during streamed responses. Add `aria-live="polite"` on the conversation container.
- [ ] **No `aria-live`/`role="alert"` on error banners** (inbox approve error `capture-review.tsx`, version toast, global-capture error/password).
- [ ] **Custom controls missing ARIA state:** plan-tabs no `aria-current` (`plan-tabs.tsx`), clarify chips no `aria-pressed` (`clarify.tsx`), inbox chat toggle no `aria-expanded` (`capture-review.tsx:529`), add-accounts tab switcher no tab roles (`add-accounts-modal.tsx:249`).
- [ ] **Graphs/treemap not keyboard/SR-accessible** (ReactFlow `selectable:false` in `points-ui.tsx`/`status-match-ui.tsx`; treemap tiles rely on hover `title` in `accounts-view.tsx`). Add SR-only text summaries.
- [ ] **Modal a11y for custom overlays:** `account-sheet.tsx` and `global-capture.tsx` overlays lack `role="dialog"`/`aria-modal`/focus-trap (Radix modals already do this right — bring these up to parity).
- [ ] **Touch targets < 24px:** draft-transaction checkboxes `size-3.5` (`draft-transaction.tsx:371`), 3-char airport inputs (`explore-ui.tsx`).
- [x] **Add `@media (prefers-reduced-motion: reduce)`** to `styles.css` — global guard neutralizing animations/transitions.
- [ ] **Low-contrast / tiny text:** graph node labels 10–12px (`points-ui.tsx`, `status-match-ui.tsx`), `+ add` buttons `text-xs text-muted-foreground` (`vault-view.tsx:210,501`).
- [ ] Misc: login `<h1>` should be the page action ("Sign in to MilesVault"); `flight-map` inner div unlabelled; trend chart needs `role="img"` (`overview-view.tsx`); nav `InboxBadge`/Logo need `aria-label`.

## P1 — consistency (app reads as built screen-by-screen)

- [ ] **Unify range/filter controls** — 3 idioms for the same job: rounded-md button group (`accounts-view`), rounded-full pill group (`overview-view`), shadcn Tabs (plan toolbar). Pick one.
- [ ] **Use the shared `Input` everywhere** — raw `<input>` in `add-card.tsx:145,218,224`, `statement-upload-modal.tsx:165` differ in focus ring/radius/font from `update-balance-modal.tsx` (which does it right).
- [ ] **One thinking indicator** — `<Loader/>` (editor) vs raw `<Loader2 className="animate-spin"/>` (concierge `:224`); add `aria-label="Assistant is thinking"`.
- [ ] **One icon library** — Lucide + Phosphor are mixed in the same nav row (divergent stroke weight).
- [ ] **Extract a shared `ActionChip`** — editor chips are inline Tailwind (`editor/chat.tsx:93`), concierge has none.
- [ ] **Chat behavior parity** — concierge composer has no Stop/`onStop` (`concierge/chat.tsx:242`) while editor does; reasoning `defaultOpen` differs; submit-disabled logic differs.
- [x] **`location.reload()` in `vault-view.tsx`** → AddAccountsModal `onDone` now re-runs the loader (no full-page flash).

## P2 — loading & feedback

- [~] **Add skeletons** — `src/components/ui/skeleton.tsx` primitive added (reduced-motion-aware) and applied to **Vault** + **account overview** loading states. Remaining: editor split panes, plan/explore result areas still use text loaders.
- [ ] **Add route-group `loading.tsx` / `error.tsx` / `not-found.tsx`** — failures currently blow away the chrome with an unbranded Next error page.
- [ ] **Ingestion dead-time is invisible** — between `captured` and `processing` there's no queue position/ETA; the 8s poll lags the chip. Surface queue state; consider a faster signal.
- [ ] **Per-button submit feedback** — draft-transaction / modal Approve buttons disable at card level but show no per-button spinner during the write.
- [ ] **Surface `UpdateBalanceModal` preview** — `preview` is computed (`:101`) but never rendered; show the beancount text like every other write path.

## P2 — mobile (beyond the viewport tag)

- [ ] **Editor & Inbox split panes contend for vertical space on phones.** Inbox detail stacks full-height Journal + action bar + `max-h-[28rem]` chat with no height negotiation; editor composer's 3 full-text action chips don't wrap (`editor/chat.tsx:98–111`). Convert to sheets/tabs on small screens.
- [ ] **Hardcoded light-mode colors** in `flight-map.tsx` (`#0f172a`, `#e5e7eb`) and divergent approach in `status-match-ui.tsx` — use CSS vars / `currentColor` so dark mode works.
- [ ] **Filter/scroll affordances** — plan-tabs overflow has no edge-fade indicator; points/status filter popovers have no close button on touch.

## P3 — copy / polish

- [ ] Empty-state strings are type-agnostic (`accounts-view.tsx:392` always "No expenses…" even for Income/Assets).
- [ ] Account paths leak internal beancount format to users (`overview-view.tsx:174`, `explore-link.tsx` raw `source`).
- [ ] Cabin abbreviations ambiguous (`FST`, `PRE`) in `explore-ui.tsx`; airport inputs need typeahead/validation.
- [ ] `image_only` upload error gives no next step (`statement-upload-modal.tsx`); add "export a text PDF" hint.
- [ ] Inbox: "Dismiss" vs permanent "Delete" share identical ghost styling — differentiate; no path to view/un-dismiss dismissed items.
- [ ] Chart tokens `--chart-1..5` are all achromatic grays in `styles.css` — any categorical chart will be greyscale.

## Cross-cutting fixes with the most leverage

1. ✅ Viewport meta tag (retires most mobile breakage at the root).
2. ✅ Shared primitives landed — `fetchJSON`, `useAsyncData`, `Skeleton`, `CenteredState.onRetry`. Applied to the 3 plan containers; sweep the rest (vault, accounts, inbox, modals) onto them to finish retiring silent `.catch`es + "Loading…" text.
3. An `aria-live` + ARIA-state pass over chats and custom controls.
4. Consolidate range/filter control + `Input` + thinking-indicator into shared components.

## Legend

`[x]` done · `[~]` partial (infra landed, application pending) · `[ ]` not started
