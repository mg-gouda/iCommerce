import { z } from "@medusajs/framework/zod"
import { CreateProduct, UpdateProduct } from "@medusajs/medusa/api/admin/products/validators"

const profile = {
  name: z.string().min(1),
  logo: z.string().url().nullish(),
  banner: z.string().url().nullish(),
  description: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  country: z.string().length(2).nullish(),
  city: z.string().nullish(),
}

export const PostVendorApply = z
  .object({
    ...profile,
    handle: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
  })
  .strict()

export const PostVendorMe = z.object(profile).partial().strict()

export const ProductExtra = z
  .object({
    unit: z.string().nullish(),
    min_qty: z.number().int().positive().nullish(),
    max_qty: z.number().int().positive().nullish(),
    qty_step: z.number().int().positive().nullish(),
    hs_code: z.string().nullish(),
    cost_price: z.number().nonnegative().nullish(),
    b2b_only: z.boolean().optional(),
    b2c_enabled: z.boolean().optional(),
    origin_country: z.string().length(2).optional(),
  })
  .strict()

// Vendors cannot pick sales channels / shipping profiles; the platform assigns them.
export const PostVendorProduct = CreateProduct.omit({ sales_channels: true, shipping_profile_id: true })
  .extend({ extra: ProductExtra.optional() })
  .strict()

export const PostVendorProductUpdate = UpdateProduct.omit({ sales_channels: true, shipping_profile_id: true })
  .extend({ extra: ProductExtra.optional() })
  .strict()

export const GetVendorProducts = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "proposed", "published", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type PostVendorApplyType = z.infer<typeof PostVendorApply>
export type PostVendorMeType = z.infer<typeof PostVendorMe>
export type PostVendorProductType = z.infer<typeof PostVendorProduct>
export type PostVendorProductUpdateType = z.infer<typeof PostVendorProductUpdate>
export type GetVendorProductsType = z.infer<typeof GetVendorProducts>
