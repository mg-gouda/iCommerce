"use client"

import { Check } from "lucide-react"
import { useRef, useState, type MouseEvent } from "react"
import { Button, type ButtonProps } from "./Button"
import { cx } from "./cx"
import { driveTruck } from "./motion"

export type ShipButtonProps = Omit<ButtonProps, "onClick"> & {
  label: string
  busyLabel: string
  doneLabel: string
  /** Saves the shipment. The truck only drives after it resolves; `false` (or a throw) = failed → back to idle. Done state is final. */
  onShip?: () => void | boolean | Promise<void | boolean>
  /** After the truck has arrived (e.g. refresh the page). */
  onDone?: () => void
  shipped?: boolean
}

export function ShipButton({ label, busyLabel, doneLabel, onShip, onDone, shipped, className, style, ...props }: ShipButtonProps) {
  const [state, setState] = useState<"idle" | "busy" | "done">(shipped ? "done" : "idle")
  const truck = useRef<SVGSVGElement>(null)
  const road = useRef<HTMLSpanElement>(null)

  async function ship(e: MouseEvent<HTMLButtonElement>) {
    if (state !== "idle") return
    const btn = e.currentTarget
    setState("busy")
    const ok = await Promise.resolve(onShip?.()).catch(() => false)
    if (ok === false) return setState("idle")
    await driveTruck(btn, truck.current!, road.current!)
    setState("done")
    onDone?.()
  }

  return (
    <Button
      variant="primary"
      {...props}
      className={cx("ic-mbtn ic-ship", className)}
      style={{ minInlineSize: 170, ...style }}
      data-state={state}
      onClick={ship}
      aria-live="polite"
    >
      <svg ref={truck} className="ic-truck" viewBox="0 0 34 20" aria-hidden>
        <path d="M1 3h19v11H1z" fill="currentColor" />
        <path d="M20 7h7l5 5v2H20z" fill="currentColor" opacity=".85" />
        <circle cx="7" cy="16" r="3" fill="currentColor" stroke="var(--brand)" strokeWidth="1.5" />
        <circle cx="26" cy="16" r="3" fill="currentColor" stroke="var(--brand)" strokeWidth="1.5" />
      </svg>
      <span ref={road} className="ic-road" />
      <span className="ic-mbtn__label">
        {state === "done" ? (
          <>
            <Check size={16} aria-hidden />
            {doneLabel}
          </>
        ) : state === "busy" ? (
          busyLabel
        ) : (
          label
        )}
      </span>
    </Button>
  )
}
