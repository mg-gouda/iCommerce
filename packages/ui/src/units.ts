// `t` = next-intl translator scoped to the app's "units" messages (ICU plurals per known unit).
type UnitsT = { (key: string, values: { n: number }): string; has(key: string): boolean }

// ponytail: only the common legacy spellings seen in WP data; other free-text units print raw.
const ALIAS: Record<string, string> = {
  pcs: "piece", peice: "piece", pieces: "piece", meter: "m", meter2: "m2", kilogram: "kg",
  dz: "dozen", bottel: "bottle", rolls: "roll", sacks: "sack", pr: "pair",
}

/** "2 pieces" / "قطعتان"; unknown unit → "2 widget". */
export function qtyUnit(t: UnitsT, n: number, unit: string) {
  const u = unit.trim().toLowerCase()
  const key = ALIAS[u] ?? u
  return t.has(key) ? t(key, { n }) : `${n} ${unit}`
}
