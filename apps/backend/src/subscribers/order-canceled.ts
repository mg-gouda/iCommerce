import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { rebuildOrderFacts } from "../lib/reports"

// Canceled parent or child → its facts go (a parent rebuilds every child).
export default async function orderCanceled({ event, container }: SubscriberArgs<{ id: string }>) {
  await rebuildOrderFacts(container, event.data.id)
}

export const config: SubscriberConfig = { event: "order.canceled" }
