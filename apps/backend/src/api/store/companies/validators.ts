import { z } from "@medusajs/framework/zod"

export const CompanyProfile = z
  .object({
    name: z.string().trim().min(1).max(200),
    country: z.string().trim().length(2).transform((c) => c.toUpperCase()),
    city: z.string().trim().max(100).nullish(),
    address: z.string().trim().max(300).nullish(),
    phone: z.string().trim().max(40).nullish(),
  })
  .strict()

export const Role = z.enum(["admin", "buyer", "approver"])
