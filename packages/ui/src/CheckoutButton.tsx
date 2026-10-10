"use client"

import { Check } from "lucide-react"
import { useState, type MouseEvent } from "react"
import { Button, type ButtonProps } from "./Button"
import { cx } from "./cx"
import { bump, fly, reducedMotion, sleep } from "./motion"

export type CheckoutButtonProps = Omit<ButtonProps, "onClick"> & {
  label: string
  packingLabel: string
  doneLabel: string
  /** Thumbnails that drop into the box. Default `[data-cart-thumb]`; max 5 animate. */
  itemsSelector?: string
  /** Called after the box seals (~1s). Navigate here; prefetch the route on click. */
  onDone?: () => void
}

export function CheckoutButton({
  label, packingLabel, doneLabel, itemsSelector = "[data-cart-thumb]", onDone, className, ...props
}: CheckoutButtonProps) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")
  const [closed, setClosed] = useState(false)

  async function go(e: MouseEvent<HTMLButtonElement>) {
    if (state !== "idle") return
    const box = e.currentTarget.querySelector(".ic-box")!
    setState("busy")
    const items = [...document.querySelectorAll(itemsSelector)].slice(0, 5)
    await Promise.all(
      items.map((el, i) =>
        fly(el, box, { duration: 560, delay: i * 90, scale: 0.14, easingY: "cubic-bezier(.5,0,.75,0)" }).then(() => bump(box))
      )
    )
    setClosed(true)
    await sleep(reducedMotion() ? 0 : 420)
    setState("done")
    await sleep(500)
    onDone?.()
  }

  return (
    <Button
      variant="primary"
      size="lg"
      block
      {...props}
      className={cx("ic-mbtn", className)}
      data-state={state}
      onClick={go}
      aria-live="polite"
    >
      <svg className={cx("ic-box", closed && "is-closed")} viewBox="0 0 24 24" aria-hidden>
        <path className="body" d="M4 9h16v11H4z" />
        <path className="flap flap-l" d="M4 9 1 5" />
        <path className="flap flap-r" d="M20 9l3-4" />
        <path className="tape" d="M7 9h10" />
      </svg>
      <span className="ic-mbtn__label">
        {state === "done" ? (
          <>
            <Check size={16} aria-hidden />
            {doneLabel}
          </>
        ) : state === "busy" ? (
          packingLabel
        ) : (
          label
        )}
      </span>
    </Button>
  )
}
