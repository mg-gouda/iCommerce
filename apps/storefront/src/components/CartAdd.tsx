"use client"

import { AddToCartButton, type AddToCartButtonProps } from "@icommerce/ui"
import { addToCart } from "@/lib/cart-actions"

/** AddToCartButton bound to the cart action; a server refusal (e.g. Wholesale MOQ) goes to `onRefused` and shows the error state. */
export function CartAdd({ productId, qty = 1, onRefused, ...props }: Omit<AddToCartButtonProps, "onAdd" | "onError"> & { productId: string; onRefused?: (msg: string) => void }) {
  return (
    <AddToCartButton
      {...props}
      qty={qty}
      onAdd={async () => {
        onRefused?.("")
        const r = await addToCart(productId, qty)
        if (r.error) {
          onRefused?.(r.error)
          throw new Error(r.error)
        }
        return r.count
      }}
    />
  )
}
