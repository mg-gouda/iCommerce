# P2 Backend API — B2C checkout, vendor orders, shipping, payments, emails

Base URL `http://localhost:9000`. Medusa 2.21.2. Conventions (errors, auth headers, money in major units, 404-never-403 isolation) as in [p1-backend.md](p1-backend.md).
All `/store/*` calls need `x-publishable-api-key` (`Storefront` key from `seed-defaults`, Retail + Wholesale; carts are created with an explicit `sales_channel_id` = Retail, see p1-backend.md §6).

## 0. Setup (per environment)
```
medusa exec ./src/scripts/seed-defaults.ts               # region Egypt now has payment providers cod + bank-transfer
medusa exec ./src/scripts/backfill-vendor-shipping.ts     # once: shipping profile/location/zone per vendor, products → vendor profile
medusa exec ./src/scripts/seed-demo.ts                    # dev only: demo vendors also get one flat shipping option
```
Env: `BANK_TRANSFER_DETAILS` (free text shown to buyers, newlines ok), `RESEND_API_KEY` + `EMAIL_FROM` (unset → emails written to `apps/backend/.emails/*.html`), `EMAILS_DIR` (override that folder).

---

## 1. Customers (standard Medusa, actor `customer`)
- Register: `POST /auth/customer/emailpass/register {email,password}` → `{token}` → `POST /store/customers {email, first_name, last_name, phone?, metadata: {locale: "en"|"ar"}}` (Bearer = registration token) → login `POST /auth/customer/emailpass` → `{token}`.
- `metadata.locale` picks the email language (default `en`). Update later with `POST /store/customers/me {metadata:{locale}}`.
- Addresses, `GET /store/customers/me`, `GET /store/orders` are core routes. `GET /store/orders` returns **parent orders only** (middleware adds `metadata.parent_order_id IS NULL`; vendor sub-orders share the customer but never list; `count` matches).

## 2. Multi-vendor shipping (the cart needs **one shipping method per vendor**)
Each vendor has its own shipping profile `vendor_<handle>`, stock location `vendor_<handle>`, fulfillment set and service zone (country `eg`), all named `vendor_<handle>`, provider `manual_manual`. Every vendor product belongs to its vendor's shipping profile.

**Checkout flow** — use `GET /store/carts/:id/vendor-groups` (the standard `GET /store/shipping-options?cart_id=` also works but lists **every** vendor's options, since all vendor locations share the sales channel; don't use it for the picker).

1. Set the cart shipping address first (options are filtered by address country `eg`).
2. `GET /store/carts/:id/vendor-groups` → one group per vendor that has items in the cart:
   ```json
   {
     "vendor_groups": [ {
       "vendor": { "id": "ven_01...", "name": "Nile Looms", "handle": "nile-looms" },
       "shipping_profile_id": "sp_01...",
       "item_ids": ["cali_01..."],
       "selected_option_id": "so_01..." | null,
       "shipping_options": [ {
         "id": "so_01...", "name": "Standard delivery",
         "kind": "flat" | "free_over" | "pickup",
         "amount": 5,
         "free_over": 100 | null
       } ]
     } ]
   }
   ```
   `selected_option_id` = option of the cart's current method for this vendor. `amount` = price for this cart (0 once free_over is reached / pickup).
   Items of products without a vendor (admin-created) are not grouped. A group with `shipping_options: []` = vendor ships nowhere yet → cart can't complete; show "vendor doesn't deliver to this address".
3. For each group: `POST /store/carts/:id/shipping-methods {option_id}` (standard). Adding an option of a profile that already has a method **replaces** it (Medusa behaviour) → re-selecting is safe.
4. Cart completion fails with 400 `The cart items require shipping profiles that are not satisfied by the current shipping methods` if a vendor group has no method.

Options listed by the standard endpoint carry `metadata: { vendor_id, vendor_name, vendor_handle, kind, free_over }` too (snapshot at option creation).

`free_over`: amount drops to 0 when the **whole cart** item total ≥ `free_over` (Medusa price rule `item_total`). ponytail: cart-wide, not per-vendor subtotal.
`pickup`: price 0, buyer collects from the vendor (no address logic).

## 3. Payments (region Egypt, currency USD)
| Provider id | Meaning | Lifecycle |
|---|---|---|
| `pp_cod_cod` | Cash on delivery | authorized at checkout → each vendor's part captured when that vendor marks delivered |
| `pp_bank-transfer_bank-transfer` | Bank transfer | authorized at checkout (= awaiting transfer) → buyer uploads proof → admin confirms → full capture |

Standard flow: `POST /store/payment-collections {cart_id}` → `POST /store/payment-collections/:id/payment-sessions {provider_id}` → `POST /store/carts/:id/complete` → `{ type: "order", order }` (the **parent** order).
Bank details: session/payment `data.bank_details` (string from `BANK_TRANSFER_DETAILS`), visible on the cart's `payment_collection.payment_sessions[].data` and in `GET /store/orders/:id/vendor-orders` → `payment.bank_details`. Also emailed.
Vendors cannot ship a bank-transfer order before the admin confirms the transfer (400).

## 4. Orders: parent + vendor orders
`order.placed` → subscriber → workflow splits the parent into one **vendor order per vendor** (a real Medusa order, own `display_id`, items + that vendor's shipping method + tax lines/adjustments copied, `metadata.parent_order_id`, `metadata.vendor_id`, item `metadata.parent_item_id`). Linked to the vendor (link `vendor`↔`order`, column `status`). Idempotent (parent `metadata.vendor_order_ids`). The parent stays the customer's order (core store routes); vendors only ever see their vendor order.

`VendorOrder.status`: `pending` (to ship) → `shipped` → `delivered`; or `canceled` (only before shipped).

### `GET /store/orders/:id/vendor-orders` (customer auth, own orders only; else 404)
Per-vendor progress for the order page. Each entry = `VendorOrder` (§6) without `email`/`buyer`/`shipping_address`/`vendor_id`, plus `vendor`. Key fields:
```json
{
  "vendor_orders": [ {
    "id": "order_01...", "display_id": 12, "status": "shipped",
    "vendor": { "id": "ven_01...", "name": "Nile Looms", "handle": "nile-looms" },
    "items": [ { "id": "ordli_...", "parent_item_id": "ordli_...", "title": "Kilim rug", "quantity": 1, "unit_price": 152 } ],
    "shipping_method": { "name": "Standard delivery", "amount": 5 },
    "total": 157,
    "fulfillment": { "carrier": "Aramex", "tracking_number": "123", "tracking_url": "https://…" | null,
                     "shipped_at": "…", "delivered_at": null } | null,
    "return_request": ReturnRequest | null
  } ],
  "payment": { "provider_id": "pp_bank-transfer_bank-transfer", "status": "authorized" | "captured" | "partially_captured" | "canceled",
               "bank_details": "Bank X, IBAN …" | null, "proof_uploaded_at": "…" | null }
}
```

### `POST /store/orders/:id/payment-proof` (customer auth, own orders, **multipart**)
Field `file`: one pdf/png/jpeg/webp, ≤10 MB. Only for `pp_bank-transfer_bank-transfer` orders not yet captured (else 400). Re-upload replaces.
`200 { "payment_proof": { "filename": "receipt.pdf", "mime_type": "application/pdf", "uploaded_at": "…" } }` · 404 not yours.

### Guest routes (no auth; order number + checkout email)
Match = a **parent** order with that `display_id` and email (case-insensitive, trimmed). Wrong number, wrong email, a vendor sub-order's number → the same `404 { "message": "Order not found" }` (no enumeration).
Rate limit: 10 per hour per IP (first `X-Forwarded-For` hop, else socket IP) → `429 { "type": "too_many_requests", "message": "Too many attempts. Try again later." }`. `guest-status` counts failed lookups only; `guest-payment-proof` counts every attempt. No per-order-number limit on purpose: order numbers are sequential, so it would let anyone lock a real buyer out of their order by guessing wrong emails. ponytail: in-memory per process.

- `GET /store/orders/guest-status?display_id=12&email=buyer@x.com` → same body as `GET /store/orders/:id/vendor-orders` plus `order`:
  ```json
  { "order": { "display_id": 12, "created_at": "…", "currency_code": "usd", "total": 167 },
    "vendor_orders": [ … ], "payment": { … } }
  ```
  No order id, address, names or buyer email in the response. Works for signed-in buyers' orders too (the storefront uses it for every order page).
- `POST /store/orders/guest-payment-proof` (**multipart**: `file` + `display_id` + `email`) → `200 { "payment_proof": {…} }` as below. Only bank-transfer orders not yet confirmed; anything else (COD, captured, mismatch) → the same 404.

### `POST /store/orders/:id/return-request` (customer auth, own orders)
```json
// req — item_id = parent order line item id (what the customer sees)
{ "reason": "Arrived damaged", "items": [ { "item_id": "ordli_...", "quantity": 1 } ] }
// 200
{ "return_requests": [ ReturnRequest & { "vendor_order_id": "order_01..." } ] }
```
Items are routed to their vendor orders; each must be `delivered`. One open request per vendor order (400 if one is `requested`/`approved`). `ReturnRequest = { status: "requested"|"approved"|"rejected", reason, items: [{item_id, quantity}] /* vendor-order item ids */, note: string|null, requested_at, decided_at|null }`.
ponytail: refunds are manual (admin refunds via Medusa admin after approval); no return shipping/labels.

## 5. Admin
- `POST /admin/orders/:id/confirm-transfer` (parent order id) → captures the remaining bank-transfer amount. `200 { "order_id", "captured": 167 }`. 400 if not bank transfer / already captured.
- `GET /admin/orders/:id/payment-proof` → streams the uploaded proof (404 if none).

## 6. Vendor API (Bearer vendor token, scoped; another vendor's order = 404)

### Shipping options
`VendorShippingOption = { id, name, kind: "flat"|"free_over"|"pickup", amount, free_over: number|null, currency_code: "usd" }`
- `GET /vendors/shipping-options` → `{ shipping_options: [VendorShippingOption] }`
- `POST /vendors/shipping-options` `{ name, kind, amount?, free_over? }` → `201 { shipping_option }`. `amount` required ≥0 for flat/free_over (ignored → 0 for pickup); `free_over` required >0 for free_over.
- `DELETE /vendors/shipping-options/:id` → `{ id, object: "shipping_option", deleted: true }`.
ponytail: no edit; delete + create.

### Orders
`VendorOrder`
```json
{
  "id": "order_01...", "display_id": 12, "status": "pending", "created_at": "…", "currency_code": "usd",
  "email": "buyer@x.com",
  "buyer": { "first_name": "Mona", "last_name": "A." },
  "shipping_address": { "first_name", "last_name", "address_1", "address_2", "city", "province", "postal_code", "country_code", "phone" },
  "items": [ { "id", "title", "variant_title", "thumbnail", "quantity", "unit_price", "total" } ],
  "shipping_method": { "name": "Standard delivery", "amount": 5 } | null,
  "item_total": 152, "shipping_total": 5, "tax_total": 0, "total": 157,
  "payment": { "provider_id": "pp_cod_cod", "status": "awaiting" | "paid" | "canceled" },
  "fulfillment": { "carrier", "tracking_number", "tracking_url", "shipped_at", "delivered_at" } | null,
  "return_request": ReturnRequest | null,
  "cancel_reason": string | null
}
```
`payment.status`: COD → `paid` once this vendor order is delivered; bank transfer → `paid` once admin confirmed.
- `GET /vendors/orders?status=pending|shipped|delivered|canceled&q=&limit=20&offset=0` → `{ orders: [VendorOrder], count, limit, offset }` newest first. `q` matches display id, email, shipping name/city/phone.
- `GET /vendors/orders/:id` → `{ order: VendorOrder }`
- `POST /vendors/orders/:id/fulfill` `{ carrier, tracking_number, tracking_url? }` → `{ order }` status `shipped` (fulfillment + shipment created, buyer emailed). 400 unless `pending`.
- `POST /vendors/orders/:id/deliver` → `{ order }` status `delivered`; COD captured for this vendor order's total; buyer emailed. 400 unless `shipped`.
- `POST /vendors/orders/:id/cancel` `{ reason }` → `{ order }` status `canceled`. 400 unless `pending`. Buyer emailed (`order-canceled`). If the parent's bank transfer was already captured → parent `metadata.refund_required = true` (admin refunds manually). When **every** vendor order of the parent is canceled, the parent is canceled too: `cancelOrderWorkflow` (authorization canceled) — or, if money was captured, a plain order cancel that leaves the payment captured (ponytail: the workflow would record an automatic refund).
- `POST /vendors/orders/:id/return-request` `{ action: "approve"|"reject", note? }` → `{ order }`. 400 unless a `requested` return exists.

## 7. Emails (Notification module, channel `email`)
| Event | To | Template |
|---|---|---|
| order placed | customer | `order-placed` |
| order placed, bank transfer | customer | `bank-transfer` |
| order placed | each vendor owner | `vendor-new-order` |
| vendor fulfils | customer | `order-shipped` (carrier + tracking) |
| vendor delivers | customer | `order-delivered` |
| vendor cancels | customer | `order-canceled` (that vendor's items, reason; COD: nothing charged · bank transfer: support will contact you about the refund) |
EN/AR by customer `metadata.locale` (AR = `dir="rtl"`). Provider: Resend when `RESEND_API_KEY` set, else files in `apps/backend/.emails/<timestamp>-<template>-<to>.html`.

- `STOREFRONT_URL` (backend env, optional): buyer emails link to `${STOREFRONT_URL}/<locale>/track`. Buyer emails always show the parent order number.
