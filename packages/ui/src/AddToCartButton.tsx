"use client"

import { Check, CircleAlert } from "lucide-react"
import { useState, type MouseEvent } from "react"
import { Button, type ButtonProps } from "./Button"
import { cx } from "./cx"
import { bump, fly, sleep } from "./motion"

/** Fired on window once the flight lands; CartLink listens and shows the new count. */
export const CART_ADD_EVENT = "icommerce:cart-add"
/** `count` = cart line count confirmed by the server; without it CartLink adds 1 to what it shows. */
export type CartAddDetail = { qty: number; count?: number }

export type AddToCartButtonProps = Omit<ButtonProps, "onClick"> & {
  label: string
  doneLabel: string
  qty?: number
  /** Runs immediately, in parallel with the flight. Resolve with the new cart count; reject → error state. */
  onAdd?: () => Promise<number | void> | void
  /** Shown briefly when `onAdd` rejects. */
  errorLabel?: string
}

export function AddToCartButton({ label, doneLabel, errorLabel, qty = 1, onAdd, className, ...props }: AddToCartButtonProps) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")

  async function add(e: MouseEvent<HTMLButtonElement>) {
    if (state === "busy") return
    const btn = e.currentTarget
    setState("busy")
    const saved = Promise.resolve(onAdd?.()).then(
      (count) => ({ ok: true, count: count ?? undefined }),
      () => ({ ok: false, count: undefined })
    )
    btn.animate([{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 160 })
    const img = btn.closest("article")?.querySelector("img")
    const cart = document.querySelector("[data-cart-target]")
    if (img && cart) await fly(img, cart)
    const { ok, count } = await saved
    if (ok) {
      bump(cart)
      window.dispatchEvent(new CustomEvent<CartAddDetail>(CART_ADD_EVENT, { detail: { qty, count } }))
    }
    setState(ok ? "done" : "error")
    await sleep(ok ? 1600 : 3200)
    setState("idle")
  }

  return (
    <Button
      variant="primary"
      {...props}
      className={cx("ic-mbtn", className)}
      data-state={state}
      onClick={add}
      aria-live="polite"
    >
      <span className="ic-mbtn__label">
        {state === "done" ? (
          <>
            <Check size={16} aria-hidden />
            {doneLabel}
          </>
        ) : state === "error" ? (
          <>
            <CircleAlert size={16} aria-hidden />
            {errorLabel ?? label}
          </>
        ) : (
          label
        )}
      </span>
    </Button>
  )
}
