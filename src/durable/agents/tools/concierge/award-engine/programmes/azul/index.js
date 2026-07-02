/**
 * Azul Fidelidade (Azul Brazilian Airlines, formerly TudoAzul) — Fully dynamic
 *
 * No fixed award chart anywhere. Azul-operated redemptions are dynamic (track
 * cash fare/demand); the partner program "Azul Pelo Mundo em Pontos" also went
 * dynamic when Azul scrapped its fixed partner zone chart in 2020 — partner cost
 * now tracks that partner's own dynamic fare. So quote every cabin as "varies".
 *
 * The only fixed numbers in the program are BRAZIL-DOMESTIC, tier-gated caps
 * (120k/130k per-leg ceiling; elite "Resgate Especial" 50k/70k) — not a chart
 * and out of scope here. Own-metal business ("Classe Executiva", A330neo) is
 * upgrade-only, not directly award-bookable; partner business/economy are.
 *
 * Redeemable partners: United, TAP, Air Canada, Copa, Turkish, Emirates.
 * Source: Azul Program terms; Passageiro de Primeira; Melhores Destinos;
 * AwardFares (2025–2026 research).
 * HOW TO REFRESH: if Azul republishes a fixed chart, add it here.
 */

import { makeEntry } from "../../shared.js";

// Azul (own) + confirmed REDEEMABLE partners (all dynamic).
const BOOKABLE = new Set([
  "AD", // Azul own metal
  "UA", "TP", "AC", "CM", "TK", "EK",
]);

export const slug = "azul-fidelidade";

export const bookable = BOOKABLE;

export function handle() {
  // Fully dynamic across every cabin (own metal and partners) — no chart.
  return [makeEntry("azul-fidelidade", "dynamic", "default", 0, 0, 0, 0)];
}
