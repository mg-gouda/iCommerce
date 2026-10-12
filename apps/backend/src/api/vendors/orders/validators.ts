import { z } from "@medusajs/framework/zod"

export const GetVendorOrders = z.object({
  status: z.enum(["pending", "shipped", "delivered", "canceled"]).optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const PostFulfill = z
  .object({
    carrier: z.string().trim().min(1),
    tracking_number: z.string().trim().min(1),
    tracking_url: z.string().url().nullish(),
  })
  .strict()

export const PostCancel = z.object({ reason: z.string().trim().min(1) }).strict()

export const PostReturnDecision = z.object({ action: z.enum(["approve", "reject"]), note: z.string().trim().nullish() }).strict()

export const PostShippingOption = z
  .object({
    name: z.string().trim().min(1),
    kind: z.enum(["flat", "free_over", "pickup"]),
    amount: z.number().nonnegative().optional(),
    free_over: z.number().positive().nullish(),
  })
  .strict()
  .refine((b) => b.kind === "pickup" || b.amount != null, { message: "amount is required", path: ["amount"] })
  .refine((b) => b.kind !== "free_over" || b.free_over != null, { message: "free_over is required", path: ["free_over"] })

export const PostReturnRequest = z
  .object({
    reason: z.string().trim().min(1),
    items: z.array(z.object({ item_id: z.string(), quantity: z.number().int().positive() })).min(1),
  })
  .strict()

export type PostShippingOptionType = z.infer<typeof PostShippingOption>
export type PostReturnRequestType = z.infer<typeof PostReturnRequest>
