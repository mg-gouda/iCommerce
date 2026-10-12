import {
  createProductsWorkflow,
  createRemoteLinkStep,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { CreateProductWorkflowInputDTO, LinkDefinition, UpdateProductDTO } from "@medusajs/framework/types"
import { VENDOR_MODULE } from "../modules/vendor"
import { PRODUCT_EXTRA_MODULE } from "../modules/product-extra"
import type ProductExtraModuleService from "../modules/product-extra/service"

export type ProductExtraInput = {
  unit?: string | null
  min_qty?: number | null
  max_qty?: number | null
  qty_step?: number | null
  hs_code?: string | null
  cost_price?: number | null
  b2b_only?: boolean
  b2c_enabled?: boolean
  origin_country?: string
  legacy_id?: string | null
}

const createProductExtraStep = createStep(
  "create-product-extra",
  async (extra: ProductExtraInput, { container }) => {
    const svc: ProductExtraModuleService = container.resolve(PRODUCT_EXTRA_MODULE)
    const created = await svc.createProductExtras(extra)
    return new StepResponse(created, created.id)
  },
  async (id, { container }) => {
    if (!id) return
    const svc: ProductExtraModuleService = container.resolve(PRODUCT_EXTRA_MODULE)
    await svc.deleteProductExtras(id)
  },
)

// ponytail: admin-created products (core /admin/products) get no vendor link or extra row; upsert on first vendor edit covers extras only.
export const createVendorProductWorkflow = createWorkflow(
  "create-vendor-product",
  (input: { vendor_id: string; product: CreateProductWorkflowInputDTO; extra: ProductExtraInput }) => {
    const products = createProductsWorkflow.runAsStep({
      // ponytail: vendors don't track stock in v1 → force unmanaged (Medusa's schema defaults it to true, and
      // managed variants have no stock levels, so they couldn't be bought). Revisit when vendor inventory lands.
      input: transform(input, (i) => ({
        products: [{ ...i.product, variants: i.product.variants?.map((v) => ({ ...v, manage_inventory: false })) }],
      })),
    })
    const extra = createProductExtraStep(input.extra)
    const links = transform({ input, products, extra }, ({ input, products, extra }): LinkDefinition[] => [
      { [VENDOR_MODULE]: { vendor_id: input.vendor_id }, [Modules.PRODUCT]: { product_id: products[0].id } },
      { [Modules.PRODUCT]: { product_id: products[0].id }, [PRODUCT_EXTRA_MODULE]: { product_extra_id: extra.id } },
    ])
    createRemoteLinkStep(links)
    return new WorkflowResponse(transform({ products }, ({ products }) => products[0]))
  },
)

type UpsertComp = { prev?: Record<string, unknown> & { id: string }; created_id?: string; product_id?: string }

// Updates the linked extra, or creates + links one if the product has none (e.g. created via admin).
const upsertProductExtraStep = createStep(
  "upsert-product-extra",
  async ({ product_id, extra }: { product_id: string; extra: ProductExtraInput }, { container }) => {
    const svc: ProductExtraModuleService = container.resolve(PRODUCT_EXTRA_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [product],
    } = await query.graph({ entity: "product", fields: ["product_extra.*"], filters: { id: product_id } })
    const prev = product?.product_extra
    if (prev) {
      await svc.updateProductExtras({ id: prev.id, ...extra })
      return new StepResponse<undefined, UpsertComp>(undefined, { prev })
    }
    const created = await svc.createProductExtras(extra)
    await container.resolve(ContainerRegistrationKeys.LINK).create({
      [Modules.PRODUCT]: { product_id },
      [PRODUCT_EXTRA_MODULE]: { product_extra_id: created.id },
    })
    return new StepResponse<undefined, UpsertComp>(undefined, { created_id: created.id, product_id })
  },
  async (comp, { container }) => {
    if (!comp) return
    const svc: ProductExtraModuleService = container.resolve(PRODUCT_EXTRA_MODULE)
    if (comp.created_id) {
      await container.resolve(ContainerRegistrationKeys.LINK).dismiss({
        [Modules.PRODUCT]: { product_id: comp.product_id },
        [PRODUCT_EXTRA_MODULE]: { product_extra_id: comp.created_id },
      })
      await svc.deleteProductExtras(comp.created_id)
    }
    if (comp.prev) {
      const { created_at, updated_at, deleted_at, raw_cost_price, ...restore } = comp.prev // eslint-disable-line @typescript-eslint/no-unused-vars
      await svc.updateProductExtras(restore as ProductExtraInput & { id: string })
    }
  },
)

export const updateVendorProductWorkflow = createWorkflow(
  "update-vendor-product",
  (input: { id: string; update: UpdateProductDTO; extra?: ProductExtraInput }) => {
    const products = updateProductsWorkflow.runAsStep({
      input: transform(input, (i) => ({ selector: { id: i.id }, update: i.update })),
    })
    upsertProductExtraStep(transform(input, (i) => ({ product_id: i.id, extra: i.extra ?? {} })))
    return new WorkflowResponse(transform({ products }, ({ products }) => products[0]))
  },
)
