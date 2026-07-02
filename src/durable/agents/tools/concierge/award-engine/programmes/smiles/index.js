/**
 * Smiles (GOL Linhas Aéreas) — Fully dynamic
 *
 * Smiles has had NO fixed award chart since November 2015 — pricing is dynamic
 * across the board, GOL own-metal AND every partner (Emirates, Qatar, Turkish,
 * Air France/KLM, American, Copa, Aerolíneas, Ethiopian, ITA, TAP, …). Cost
 * tracks the prevailing cash fare / demand / lead time, so there is nothing to
 * tabulate — quote every cabin as "varies" (dynamic).
 *
 * The only quasi-fixed numbers are the elite "Tarifa Especial" ceilings (35k /
 * 50k miles per BRAZIL-DOMESTIC segment, tier-gated) — a benefit cap, not a
 * chart, and out of scope for this engine. GOL's new A330 "Insignia" business
 * (JFK–GIG from Jul 2026) has no published redemption price yet.
 *
 * Source: smiles.com.br Program Regulation (dynamic since 2015); AwardFares;
 * Roame; Upgraded Points (2025–2026 research).
 * HOW TO REFRESH: if Smiles ever republishes a fixed chart, add it here.
 */

import { makeEntry } from "../../shared.js";

// GOL (own) + confirmed REDEEMABLE partners (all dynamic). Excludes Etihad (EY):
// live site lists it but the partnership reportedly lapsed in 2021, unresolved.
// Delta / Alitalia were dropped (2021); LATAM was never a Smiles partner.
const BOOKABLE = new Set([
  "G3", // GOL own metal
  "EK", "QR", "TK", "AF", "KL", "AA", "CM", "AR", "ET", "AZ", "TP", "IB", "BA",
  "NH", "KE", "TG", "SA", "AC", "AM", "UX",
]);

export const slug = "smiles";

export const bookable = BOOKABLE;

export function handle() {
  // Fully dynamic across every cabin (own metal and partners) — no chart.
  return [makeEntry("smiles", "dynamic", "default", 0, 0, 0, 0)];
}
