# UI / UX TODO — holistic critique backlog

Backlog from a holistic pass over all frontend screens (shell, Plan, Vault,
Editor, Concierge, Inbox/Statements, gen-UI cards, modals). Grouped by theme,
ordered roughly by impact. Checkboxes to tick as we go. File:line refs are
starting points, not exhaustive.

## P0 — high impact / likely bugs

- [x] **Add viewport meta** to `src/app/(frontend)/layout.tsx`. Done via `export const viewport` (width=device-width, initialScale 1, viewportFit cover, colorScheme light dark).
- [~] **Kill silent error swallowing (`.catch(() => {})`).** Infra built: `src/lib/fetch-json.ts` (`fetchJSON` throws with a usable message) + `src/components/shared/use-async-data.ts` (`useAsyncData` — loading/ready/error + abort + `reload`) + `CenteredState` now takes `onRetry` (role=alert). **Converted/handled:** explore (`transfer-sources`), points (`currencies`), status-match (`match-statuses`); vault main load (retry); account-overview (retry); inbox `deleteItem` (full-snapshot revert + inline alert) and `doRotate` (error surfaced); **accounts-view** (error state + retry — no more silent forever-spinner); **add-card** (distinguishes guide load-failure from genuine-empty + retry); **update-balance-modal** (surfaces targets load failure + retry). **Remaining:** only vault's cosmetic secondary overlays (`vault-stats`/`account-names`/`captures`) — degrade gracefully (labels/KPIs just absent), low priority.
- [x] **Nav state: `/accounts`** added to `PLAN_ROUTES` — Plan rail item now activates on `/accounts`.
- [x] **Pending-capture badges re-poll** — `usePendingCaptures` now reloads on `mv:captured` + tab `focus`, not just mount.
- [x] **`StatusBar` mobile offset fixed** — `left-0 md:left-[48px]` (full-width on mobile where the rail is hidden) + `aria-label`. (Hardcoded "Parsed ✓"/"Beancount v2.3.5" still static — needs a real parse-status source, deferred.)
- [x] **`account-sheet.tsx` `Row`** no longer setState-during-render — derived `open` from a query-keyed `manual` override (mirrors `journal-filter-bar`).
- [x] **`version-watcher.tsx` focus-listener leak fixed** — named `onFocus` now removed in cleanup.

## P1 — accessibility (recurring Level-A gaps)

- [x] **`aria-live` on both chats** — `ConversationContent` now `role="log" aria-live="polite"` in editor + concierge, so streamed responses are announced.
- [x] **`role="alert"` on error banners** — version toast (`role=status`), global-capture error, inbox approve error + actionError. (Password placeholder-as-error in global-capture still pending — should be its own `role=alert`, not a placeholder.)
- [x] **Custom controls ARIA state** — plan-tabs `aria-current`, clarify chips `aria-pressed`, inbox chat toggle `aria-expanded`, add-accounts tab switcher `role=tablist/tab + aria-selected`.
- [ ] **Graphs/treemap not keyboard/SR-accessible** (ReactFlow `selectable:false` in `points-ui.tsx`/`status-match-ui.tsx`; treemap tiles rely on hover `title` in `accounts-view.tsx`). Add SR-only text summaries.
- [ ] **Modal a11y for custom overlays:** `account-sheet.tsx` and `global-capture.tsx` overlays lack `role="dialog"`/`aria-modal`/focus-trap (Radix modals already do this right — bring these up to parity).
- [ ] **Touch targets < 24px:** draft-transaction checkboxes `size-3.5` (`draft-transaction.tsx:371`), 3-char airport inputs (`explore-ui.tsx`).
- [x] **Add `@media (prefers-reduced-motion: reduce)`** to `styles.css` — global guard neutralizing animations/transitions.
- [ ] **Low-contrast / tiny text:** graph node labels 10–12px (`points-ui.tsx`, `status-match-ui.tsx`), `+ add` buttons `text-xs text-muted-foreground` (`vault-view.tsx:210,501`).
- [~] Misc: nav `InboxBadge` + `Logo` `aria-label` DONE; status-bar footer `aria-label` DONE. Remaining: login `<h1>` page action ("Sign in to MilesVault"), `flight-map` inner div unlabelled, trend chart `role="img"` (`overview-view.tsx`).

## P1 — consistency (app reads as built screen-by-screen)

- [x] **Unified range/filter controls** — shared `SegmentedControl` (rounded pill, in `components/shared`) now used by accounts-view (type + range) and overview-view (range), matching the editor/inbox tab idiom.
- [~] **Shared `Input`** applied to statement-upload password + add-card last4/points; the add-card SEARCH field stays a composed icon-input (would double-border).
- [x] **One thinking indicator** — concierge now uses the shared `<Loader>` with `role=status aria-label="Assistant is thinking"` (was a raw `<Loader2 animate-spin/>`).
- [ ] **One icon library** — Lucide + Phosphor are mixed in the same nav row (divergent stroke weight).
- [ ] **Extract a shared `ActionChip`** — editor chips are inline Tailwind (`editor/chat.tsx:93`), concierge has none.
- [~] **Chat parity** — concierge now has Stop + reasoning `defaultOpen` (matches editor). Remaining: submit-disabled logic differs (minor).
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

- [x] Empty-state strings type-aware in `accounts-view` (`No {type} in this period.`).
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
