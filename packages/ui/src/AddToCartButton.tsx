"use client"

import { Check } from "lucide-react"
import { useState, type MouseEvent } from "react"
import { Button, type ButtonProps } from "./Button"
import { cx } from "./cx"
import { bump, fly, sleep } from "./motion"

/** Fired on window once the flight lands; CartLink listens and bumps its count. */
export const CART_ADD_EVENT = "icommerce:cart-add"
export type CartAddDetail = { qty: number }

export type AddToCartButtonProps = Omit<ButtonProps, "onClick"> & {
  label: string
  doneLabel: string
  qty?: number
  /** Runs immediately (optimistic); the flight is feedback only. */
  onAdd?: () => void
}

export function AddToCartButton({ label, doneLabel, qty = 1, onAdd, className, ...props }: AddToCartButtonProps) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")

  async function add(e: MouseEvent<HTMLButtonElement>) {
    if (state === "busy") return
    const btn = e.currentTarget
    setState("busy")
    onAdd?.()
    btn.animate([{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 160 })
    const img = btn.closest("article")?.querySelector("img")
    const cart = document.querySelector("[data-cart-target]")
    if (img && cart) await fly(img, cart)
    bump(cart)
    window.dispatchEvent(new CustomEvent<CartAddDetail>(CART_ADD_EVENT, { detail: { qty } }))
    setState("done")
    await sleep(1600)
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
        ) : (
          label
        )}
      </span>
    </Button>
  )
}
