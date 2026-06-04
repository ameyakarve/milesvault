import { makeEntry, resolveChart, resolveBand } from "../../shared.js";

const BOOKABLE = new Set(["AA","AC","AD","AF","AT","B6","DE","ET","EY","GA","GF","HU","HX","JU","KL","LY","MH","MU","NH","NZ","OZ","SK","SN","SV","TP","UL","UX","VN","WY"]);

const ET_BANDS = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, Infinity];
const ET_OWN = [
  [5000,15000,30000],[10000,20000,40000],[13000,30000,55000],[15000,35000,80000],
  [20000,45000,90000],[25000,60000,110000],[30000,70000,120000],[37000,75000,135000],
  [45000,95000,140000],[60000,120000,160000],
];
const ET_PTR = [
  [6000,7500,20000,35000],[12000,13000,25000,40000],[15000,19000,30000,45000],
  [23000,25000,40000,54000],[28000,31000,50000,67000],[34000,37000,60000,80000],
  [45000,49000,80000,107000],[60000,62000,100000,134000],[67000,74000,120000,160000],
  [75000,90000,140000,200000],
];

const EY_CARRIERS = new Set(["EY"]);

export const slug = "etihad-guest";

export const bookable = BOOKABLE;

export function handle(legs, distance) {
  // Etihad Guest does not support multi-carrier awards — each partner ticketed separately
  const carriers = new Set(legs.map((l) => l.carrier).filter(Boolean));
  if (carriers.size > 1) return [];

  const chart = resolveChart(legs, EY_CARRIERS);
  const idx = resolveBand(distance, ET_BANDS);
  const entries = [];

  if (chart !== "partner") {
    const [e, b, f] = ET_OWN[idx];
    entries.push(makeEntry("etihad", "etihad", "default", e, null, b, f));
  }

  if (chart !== "own") {
    const [pe, pp, pb, pf] = ET_PTR[idx];
    entries.push(makeEntry("etihad", "partner", "default", pe, pp, pb, pf));
  }

  return entries;
}
