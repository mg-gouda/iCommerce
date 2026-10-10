// Travel animations behind AddToCartButton / CheckoutButton / ShipButton. Plain WAAPI, no deps.
// Feedback only: the action itself never waits on these. Reduced motion → no travel.

export const EASE = "cubic-bezier(.25,1,.5,1)"
const EASE_IO = "cubic-bezier(.65,0,.35,1)"

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function bump(el: Element | null) {
  el?.animate(
    reducedMotion()
      ? [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }]
      : [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }],
    { duration: 320, easing: EASE }
  )
}

type FlyOpts = { duration?: number; delay?: number; scale?: number; easingY?: string }

/** Fly a copy of `from` onto `to` along an arc (x eases in-out, y eases separately). Resolves on landing. */
export function fly(from: Element, to: Element, o: FlyOpts = {}): Promise<void> {
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  if (reducedMotion() || !a.width) return Promise.resolve()
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const outer = document.createElement("div")
  const inner = document.createElement("div")
  outer.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;pointer-events:none;z-index:var(--z-toast)`
  inner.style.cssText = "width:100%;height:100%;overflow:hidden;border-radius:var(--radius-lg);box-shadow:var(--shadow-2)"
  const ghost = from.cloneNode(true) as HTMLElement
  ghost.removeAttribute("id")
  ghost.style.cssText = "width:100%;height:100%;object-fit:cover;display:block"
  inner.append(ghost)
  outer.append(inner)
  document.body.append(outer)
  const d = o.duration ?? 700
  const timing = { duration: d, delay: o.delay ?? 0, fill: "both" as const }
  outer.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], { ...timing, easing: EASE_IO })
  return inner
    .animate(
      [
        { transform: "translateY(0) scale(1)", opacity: 1, borderRadius: "10px" },
        { transform: `translateY(${dy * 0.35}px) scale(.55)`, opacity: 1, offset: 0.45 },
        { transform: `translateY(${dy}px) scale(${o.scale ?? 0.16})`, opacity: 0.7, borderRadius: "50%" },
      ],
      { ...timing, easing: o.easingY ?? "cubic-bezier(.3,0,.2,1)" }
    )
    .finished.then(() => outer.remove())
}

/** Truck run across `btn` in reading direction (LTR left→right, RTL mirrored). */
export function driveTruck(btn: HTMLElement, truck: Element, road: Element): Promise<void> {
  if (reducedMotion()) return Promise.resolve()
  const rtl = getComputedStyle(btn).direction === "rtl"
  const w = btn.getBoundingClientRect().width
  const [from, to, flip] = rtl ? [w + 8, -48, " scaleX(-1)"] : [-48, w + 8, ""]
  const d = 1300
  road.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: d, fill: "both" })
  road.animate([{ backgroundPositionX: "0px" }, { backgroundPositionX: `${rtl ? 64 : -64}px` }], { duration: d })
  truck.animate([{ transform: "translateY(0)" }, { transform: "translateY(-1px)" }, { transform: "translateY(0)" }], { duration: 160, iterations: 8 })
  return truck
    .animate(
      [
        { transform: `translateX(${from}px)${flip}` },
        { transform: `translateX(${w / 2 - 20}px)${flip}`, offset: 0.5 },
        { transform: `translateX(${to}px)${flip}` },
      ],
      { duration: d, easing: EASE_IO }
    )
    .finished.then(() => undefined)
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
