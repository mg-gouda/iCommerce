import { buyingMode } from "./mode"

/** Sales channel for new / switched carts: Wholesale (tier prices + MOQ checks) for verified members in wholesale mode. */
export async function cartSalesChannel() {
  const { wholesale } = await buyingMode()
  return (wholesale ? process.env.WHOLESALE_SALES_CHANNEL_ID : process.env.RETAIL_SALES_CHANNEL_ID) || undefined
}
