// Money math in integer cents (half up). Inputs: numbers or Medusa BigNumber-ish values in major units.
export const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100 + 1e-7)
export const major = (c: number) => c / 100
export const round2 = (n: number) => major(cents(n))

/** clamp(base × percent / 100 + fixed, min, max) in cents; null bounds = open. */
export function rateCents(baseCents: number, percent: unknown, fixed: unknown, min: unknown, max: unknown) {
  let c = Math.round((baseCents * Number(percent ?? 0)) / 100 + 1e-7) + cents(fixed)
  if (min != null) c = Math.max(c, cents(min))
  if (max != null) c = Math.min(c, cents(max))
  return Math.max(c, 0)
}

/** Splits `total` cents over `weights` pro rata; largest remainder → parts sum exactly to total. */
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (!sum) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const parts = raw.map(Math.floor)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  const left = total - parts.reduce((s, p) => s + p, 0)
  for (let k = 0; k < left; k++) parts[order[k][1]]++
  return parts
}

/** Active at `at`: from ≤ at < to, null = open. */
export const activeAt = (r: { active_from?: Date | string | null; active_to?: Date | string | null }, at: Date) =>
  (!r.active_from || new Date(r.active_from) <= at) && (!r.active_to || new Date(r.active_to) > at)
