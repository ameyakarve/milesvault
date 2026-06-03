export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3440.065;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)) * 1.15078);
}

export function resolveBand(distance, bands) {
  for (let i = 0; i < bands.length; i++) {
    if (distance <= bands[i]) return i;
  }
  return bands.length - 1;
}

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function makeEntry(programme, chart, season, e, pe, b, f) {
  const wrap = (v) => (v === null || v === undefined) ? null : [v, v];
  return { programme, chart, season, economy: wrap(e), premium_economy: wrap(pe), business: wrap(b), first: wrap(f) };
}

export function resolveChart(legs, ownCarriers) {
  const specified = legs.filter((l) => l.carrier);
  if (specified.length === 0) return "both";
  const allOwn = specified.every((l) => ownCarriers.has(l.carrier));
  const anyOwn = specified.some((l) => ownCarriers.has(l.carrier));
  if (allOwn) return "own";
  if (!anyOwn) return "partner";
  return "both";
}
