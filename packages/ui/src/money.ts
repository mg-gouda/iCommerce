/** "USD 152.00": currency code + Latin digits in every locale (prices never localize digits). */
export const money = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
