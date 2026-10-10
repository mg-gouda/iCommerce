import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { removeProduct, syncProduct } from "../lib/search"

export default async function productSearch({ event, container }: SubscriberArgs<{ id: string }>) {
  if (event.name === "product.deleted") await removeProduct(event.data.id)
  else await syncProduct(container, event.data.id)
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
}
