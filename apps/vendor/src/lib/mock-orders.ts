// ponytail: P0 placeholder orders so the ship flow is visible; replaced by vendor orders API in P2.
type L = { en: string; ar: string }
export type MockOrder = { id: string; buyer: L; channel: "b2b" | "b2c"; items: L; total: number; shipped: boolean }

export const orders: MockOrder[] = [
  { id: "SO-2026-01187", buyer: { en: "Hamburg Haus GmbH", ar: "هامبورغ هاوس" }, channel: "b2b", items: { en: "200 sets", ar: "٢٠٠ طقم" }, total: 2480, shipped: false },
  { id: "SO-2026-01190", buyer: { en: "Mona A., Giza", ar: "منى أ.، الجيزة" }, channel: "b2c", items: { en: "1 set", ar: "طقم واحد" }, total: 14.9, shipped: false },
  { id: "SO-2026-01174", buyer: { en: "Al Noor Hotels, Riyadh", ar: "فنادق النور، الرياض" }, channel: "b2b", items: { en: "800 sets", ar: "٨٠٠ طقم" }, total: 8880, shipped: true },
]
