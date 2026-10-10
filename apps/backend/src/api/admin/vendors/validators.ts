import { z } from "@medusajs/framework/zod"

export const PostAdminVendorNote = z.object({ note: z.string().trim().min(1).optional() }).strict()

export const GetAdminVendors = z.object({
  q: z.string().optional(),
  status: z.enum(["pending", "approved", "suspended"]).optional(),
  kyc_status: z.enum(["none", "submitted", "verified", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type PostAdminVendorNoteType = z.infer<typeof PostAdminVendorNote>
