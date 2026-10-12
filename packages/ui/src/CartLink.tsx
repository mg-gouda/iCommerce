"use client"

import { ShoppingCart } from "lucide-react"
import { useEffect, useState, type AnchorHTMLAttributes } from "react"
import { CART_ADD_EVENT, type CartAddDetail } from "./AddToCartButton"
import { cx } from "./cx"

export type CartLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  /** Accessible name; `{count}` is replaced, e.g. "Cart, {count} items". */
  label: string
  /** Server-rendered cart count; AddToCartButton landings update it until the next render. */
  count?: number
}

export function CartLink({ label, count: server = 0, className, ...props }: CartLinkProps) {
  const [count, setCount] = useState(server)
  const [seen, setSeen] = useState(server)
  if (server !== seen) {
    setSeen(server)
    setCount(server)
  }
  useEffect(() => {
    const onAdd = (e: Event) => {
      const d = (e as CustomEvent<CartAddDetail>).detail
      setCount((c) => d.count ?? c + d.qty)
    }
    window.addEventListener(CART_ADD_EVENT, onAdd)
    return () => window.removeEventListener(CART_ADD_EVENT, onAdd)
  }, [])
  return (
    <a {...props} className={cx("ic-cart", className)} data-cart-target aria-label={label.replace("{count}", String(count))}>
      <ShoppingCart aria-hidden className="rtl:-scale-x-100" />
      {count > 0 && <span className="ic-cart__count">{count}</span>}
    </a>
  )
}
