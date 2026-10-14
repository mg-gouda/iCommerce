/** "USD 152.00": currency code + Latin digits in every locale (prices never localize digits). */
export const money = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Unicode isolate (FSI…PDI) = `<bdi>` for plain strings: wrap LTR values (money, codes) before putting them into a
 * translated sentence, so Arabic brackets / word order around "USD 489.45" render correctly. Works in labels + aria too.
 */
export const bidi = (s: string | number) => `\u2068${s}\u2069`
