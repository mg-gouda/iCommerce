# P3 Backend API — B2B: companies, wholesale pricing, quotes (RFQ), net terms

Base URL `http://localhost:9000`. Medusa 2.21.2. Conventions as in [p1-backend.md](p1-backend.md) / [p2-backend.md](p2-backend.md):
money in major units (USD), ISO timestamps, errors `{ type, message }`, another party's resource = **404** (never leaks existence).
All `/store/*` calls need `x-publishable-api-key`. Customer routes: `Authorization: Bearer <customer token>`.

| HTTP | When |
|---|---|
| 400 `invalid_data` | validation, wrong state transition (`Quote is offered; ...`), business rule (credit limit, MOQ) |
| 401 | no / bad token |
| 403 `forbidden` | company member but wrong role (e.g. buyer inviting members) |
| 404 `not_found` | not a member of any company, or another company's / vendor's resource |

## 0. Setup
```
medusa exec ./src/scripts/seed-defaults.ts   # + net-terms provider on region Egypt, customer group b2b_verified
medusa exec ./src/scripts/seed-demo.ts       # dev only: demo company (verified), credit account, wholesale tiers
```
Env: `STOREFRONT_URL` (default `http://localhost:3000`, used in invitation links).
Sales channels: **Wholesale** = B2B carts (tier prices + MOQ enforcement); Retail = B2C.

---

## 1. Companies (customer actor + membership)

`Company`
```json
{
  "id": "comp_01...", "name": "Delta Imports", "handle": "delta-imports",
  "country": "EG", "city": "Cairo" | null, "address": "12 Nile St" | null, "phone": "+20..." | null,
  "tax_id": "..." | null, "commercial_reg_no": "..." | null, "export_card_no": "..." | null,
  "kyc_status": "none" | "submitted" | "verified" | "rejected",
  "kyc_note": "string" | null,
  "kyc_files": [ { "id": "private-...-cr.pdf", "filename": "cr.pdf", "mime_type": "application/pdf" } ] | null,
  "verified_at": "..." | null,
  "payment_mode": "upfront" | "net_terms",
  "created_at": "...", "updated_at": "..."
}
```
`CompanyMember = { "id": "cmem_01...", "customer_id": "cus_01...", "email": "a@x.com", "first_name", "last_name", "role": "admin" | "buyer" | "approver", "created_at" }`
`CompanyInvitation = { "id": "cinv_01...", "email", "role", "expires_at", "accepted_at": null, "created_at" }` (token is never returned; it is only emailed)

One customer belongs to at most one company. **Verified** (`kyc_status = verified`) gates: wholesale tier prices, RFQ, net terms.
On verify every member is added to customer group `b2b_verified` (removed on reject, member removal).

| Route | Who | Body / result |
|---|---|---|
| `POST /store/companies` | signed-in customer, no company yet | `{ name, handle?, country, city?, address?, phone? }` → `201 { company, member }` (caller = `admin`). 400 `You already belong to a company.` |
| `GET /store/companies/me` | member | `{ company, member }` (`member` = caller) |
| `POST /store/companies/me` | admin | partial `{ name?, country?, city?, address?, phone? }` → `{ company, member }` |
| `POST /store/companies/me/kyc` | admin, **multipart** | `tax_id`, `commercial_reg_no`, `export_card_no?`, `files` (1–10, ≤10 MB, pdf/png/jpeg/webp) → `{ company }` `kyc_status=submitted`. Resubmission replaces files and resets status (also from `verified` → `submitted`, removes group). |
| `GET /store/companies/me/members` | member | `{ members: [CompanyMember], invitations: [CompanyInvitation] }` (open invitations; `[]` for non-admins) |
| `POST /store/companies/me/invitations` | admin | `{ email, role }` → `201 { invitation }`; emails a link `${STOREFRONT_URL}/{locale}/account/company/join?token=...` (EN/AR by inviter's locale). 400 if email already a member. Valid 14 days. |
| `POST /store/companies/invitations/accept` | signed-in customer whose email = invitation email | `{ token }` → `{ company, member }`. 400 invalid/expired/used token, or already in a company. |
| `POST /store/companies/me/members/:id` | admin | `{ role }` → `{ member }`. 400 when demoting the last admin. |
| `DELETE /store/companies/me/members/:id` | admin | → `{ id, object: "company_member", deleted: true }`. 400 for the last admin. |
| `GET /store/companies/me/credit` | member | §4 |

Non-members get 404 on every `/store/companies/me*` route.

### Admin (`/admin/*`, admin user)
- `GET /admin/companies?q=&kyc_status=&limit=20&offset=0` → `{ companies: [Company & { members }], count, limit, offset }`
- `GET /admin/companies/:id` → `{ company: Company & { members, credit_account: CreditAccount | null } }`
- `POST /admin/companies/:id` `{ payment_mode }` → `{ company }`
- `POST /admin/companies/:id/verify` `{ note? }` → `{ company }` `kyc_status=verified`, `verified_at=now`, members → `b2b_verified`. Emails company admins.
- `POST /admin/companies/:id/reject` `{ note }` (required) → `{ company }` `kyc_status=rejected`, members removed from `b2b_verified`. Rejecting a verified company = suspend. Emails company admins.
- `GET /admin/companies/:id/kyc-files/:file_id` → streams the private file (404 if not on that company).
- `POST /admin/companies/:id/credit-account` `{ limit_usd, terms_days: 15|30|60, status?: "active"|"on_hold" }` → `{ credit_account }` (upsert)
- `POST /admin/companies/:id/price-list` `{ prices: [{ variant_id, amount }] }` → `{ price_list_id, count }` — per-company **contract** price list (replaces all its prices; `[]` clears). Applies to that company's members in Wholesale carts. ponytail: API only, no admin UI.
- Invoices: §4.

---

## 2. Wholesale pricing (tiers)

Implementation: one Medusa price list **"B2B wholesale"** (type `override`) with rules `customer.groups.id = [b2b_verified]` and `sales_channel_id = [Wholesale]`; each tier = a price with `min_quantity`. Medusa picks the matching tier from the cart line quantity → verified members get tier prices **in Wholesale-channel carts** only. Below the first tier's `min_qty` the normal price applies.

`WholesaleTier = { "min_qty": 100, "unit_price_usd": 9.5 }`

### Vendor (Bearer vendor token, own products; else 404)
- `GET /vendors/products/:id/wholesale-tiers` → `{ tiers: [WholesaleTier] }` (ascending)
- `PUT /vendors/products/:id/wholesale-tiers` `{ tiers: [WholesaleTier] }` → `{ tiers }`. Replaces all tiers (all variants get the same tiers). `[]` clears.
  Rules (400): ≤10 rows; `min_qty` > 0, ≤3 decimals, **strictly ascending**; `unit_price_usd` ≥ 0 and **must not increase** as `min_qty` grows.

### Store
- `GET /store/products/:id/wholesale-tiers` (customer token optional)
  - caller in `b2b_verified` → `{ tiers: [WholesaleTier], gated: false }` (`[]` = no tiers)
  - anyone else → `{ tiers: null, gated: true }`
- `GET /store/products/wholesale-tiers?ids=prod_a,prod_b` (1–50 ids, customer token optional) — batch for product grids
  - verified → `{ tiers: { "prod_a": [WholesaleTier], "prod_b": [] }, gated: false }` (every requested id present; `[]` = no tiers)
  - anyone else → `{ tiers: null, gated: true }` · 400 when `ids` empty or > 50

### Direct B2B checkout (Wholesale cart)
Create the cart with the **Wholesale** publishable key (or `sales_channel_id` of Wholesale; with the shared "Storefront" key you must pass it). Standard cart/checkout flow (P2).
**Wholesale carts are for signed-in members of verified companies only**: creating one, switching a cart to Wholesale (`POST /store/carts/:id {sales_channel_id}`) or adding lines to one otherwise → **403** `forbidden` `Wholesale carts are for signed-in members of verified companies.` (guests included). Retail carts are open to everyone. For Wholesale carts the server enforces on `POST /store/carts/:id/line-items` and `POST /store/carts/:id/line-items/:line_id` (line quantity after the change):
- `quantity ≥ product_extra.min_qty` → 400 `Minimum order quantity for "<title>" is 200.`
- `(quantity − min_qty) % qty_step = 0` → 400 `Quantity for "<title>" must be 200 plus multiples of 50.`
- `quantity ≤ max_qty` → 400 `Maximum order quantity for "<title>" is 20.`
Retail carts are not checked server-side (storefront snaps). Cart quantities are integers (Medusa), so fractional MOQ products stay quote-only.

---

## 3. Quotes (RFQ)

`Quote`
```json
{
  "id": "quo_01...", "rfq_id": "rfq_01...", "status": "offered",
  "currency_code": "usd",
  "company": { "id": "comp_01...", "name": "Delta Imports", "country": "EG", "city": "Cairo" },
  "vendor": { "id": "ven_01...", "name": "Helwan Metalworks", "handle": "helwan-metal" } | null,   // null while routing / routed
  "requester": { "id": "cmem_01...", "email": "buyer@delta.test", "first_name": "Sara", "last_name": "N." },
  "notes": "Need export packing" | null,          // buyer's RFQ notes
  "incoterm": "FOB" | null,                       // set by buyer at RFQ or vendor at offer
  "validity_until": "2026-11-01T00:00:00.000Z" | null,
  "total": 8885.55 | null,                        // Σ quantity × offered_unit_price (null until offered)
  "order_id": "order_01..." | null,               // parent order once ordered
  "approved_by": "cmem_01..." | null,
  "items": [ {
    "id": "quoitm_01...", "product_id": "prod_01..." | null, "variant_id": "variant_01..." | null,
    "title": "Czech pot sets", "quantity": 800.5, "unit": "set" | null,
    "target_price": 10.5 | null,                  // buyer's target / counter price per unit
    "offered_unit_price": 11.1 | null, "lead_time_days": 21 | null
  } ],
  "messages": [ { "id": "quomsg_01...", "author": "buyer" | "vendor" | "system" | "platform", "author_name": "Sara N." | null, "body": "...", "created_at": "..." } ],
  "created_at": "...", "updated_at": "..."
}
```
Lists omit `messages`. Vendors see `company` (name/country/city) + `requester` but no KYC data.

### State machine
```
routing ──staff route to 1..N vendors──▶ routed   (+ one new `requested` quote per vendor, same rfq_id)
routing ──staff close "no supplier found"──▶ rejected
requested ──vendor opens──▶ vendor_review
requested | vendor_review | negotiating ──vendor offer──▶ offered
offered ──buyer counter──▶ negotiating
offered ──accept (admin/approver, or no approvers in company)──▶ accepted ──▶ ordered
offered ──accept by buyer when company has approvers──▶ pending_approval ──approve──▶ accepted ──▶ ordered
requested | vendor_review | negotiating | offered ──vendor reject──▶ rejected
requested | vendor_review | negotiating | offered | pending_approval ──buyer reject──▶ rejected
offered | pending_approval ──validity_until passed (hourly job)──▶ expired
```
- `accepted` is momentary: the same request creates the order and the quote ends `ordered` (if order creation fails, e.g. credit limit, the request fails with 400 and the status is unchanged).
- Accepting needs `validity_until` in the future (400 `Offer expired.`).
- Every transition appends a `system` message whose `body` is an **event code** (translate it client-side): `requested`, `viewed` (vendor opened), `offered`, `countered`, `pending_approval`, `ordered`, `rejected`, `expired`, `routing`, `routed`, `no_supplier`. `platform` messages = iCommerce staff notes (`author_name` "iCommerce").
- **`routing`** (decision 16): free-text lines the buyer sent with `find_suppliers: true` → one vendor-less quote per RFQ (`vendor: null`), invisible to vendors; buyer can't message/act on it. Staff route it (§3 Admin) or close it. `routed` quotes are terminal and hidden from the buyer's default list. Buyer/vendor notes (offer note, counter message, reject reason) are separate `buyer`/`vendor` messages. Each transition also emails the other party (EN/AR by the recipient customer's `metadata.locale`; vendors EN).

### Store (customer token, member of a **verified** company for create; any member for the rest; other company's quote = 404)
- `POST /store/quotes` — create RFQ
  ```json
  {
    "items": [
      { "variant_id": "variant_01...", "quantity": 800.5, "target_price": 10.5 },          // catalog item (vendor from product)
      { "title": "Custom aluminum tray 50×40", "vendor_id": "ven_01...", "quantity": 1000, "unit": "piece" },  // free text → that vendor
      { "title": "Jute sacks", "find_suppliers": true, "quantity": 1000 }  // free text → iCommerce finds suppliers
    ],
    "notes": "optional", "incoterm": "FOB" | null
  }
  ```
  `quantity` > 0, ≤3 decimals. `product_id` may be sent instead of `variant_id` (first variant used). Title/unit default from product. Free-text items need **exactly one** of `vendor_id` (approved vendor) / `find_suppliers: true`. Items are grouped per vendor → **one quote per vendor**, all sharing `rfq_id`; all `find_suppliers` items → **one `routing` quote** (`vendor: null`, no vendor email).
  → `201 { rfq_id, quotes: [Quote] }`. 400 `Company must be verified to request quotes.` · 400 unknown product/vendor.
- `GET /store/quotes?status=&rfq_id=&limit=20&offset=0` → `{ quotes: [Quote], count, limit, offset }` (company's quotes, newest first; `routed` excluded unless `status=routed`)
- `GET /store/quotes/:id` → `{ quote }`
- `POST /store/quotes/:id/messages` `{ body }` → `{ quote }` (any open status)
- `POST /store/quotes/:id/counter` `{ message, items?: [{ id, target_price }] }` → `{ quote }` status `negotiating` (from `offered`)
- `POST /store/quotes/:id/accept` → `{ quote }` status `pending_approval` or `ordered`. **Idempotent + race-safe**: actions on one quote are serialized by a lock (Locking module, key `quote-<id>`) and the status is re-read inside it; a repeat or concurrent accept returns `200` with the same quote/`order_id` (never a second order). Same for `approve`.
- `POST /store/quotes/:id/approve` (approver or admin) → `{ quote }` status `ordered` (from `pending_approval`); 403 for buyers
- `POST /store/quotes/:id/reject` `{ reason? }` → `{ quote }` status `rejected`

### Vendor (Bearer vendor token; another vendor's quote = 404)
- `GET /vendors/quotes?status=&q=&limit=20&offset=0` → `{ quotes: [Quote], count, limit, offset }` (`q` matches company name)
- `GET /vendors/quotes/:id` → `{ quote }` (first open moves `requested` → `vendor_review`)
- `POST /vendors/quotes/:id/messages` `{ body }` → `{ quote }`
- `POST /vendors/quotes/:id/offer`
  ```json
  { "items": [ { "id": "quoitm_01...", "offered_unit_price": 11.1, "lead_time_days": 21 } ],   // every item, once
    "validity_until": "2026-11-01", "incoterm": "FOB" | null, "note": "optional message" }
  ```
  → `{ quote }` status `offered`, `total` computed. `validity_until` must be in the future.
- `POST /vendors/quotes/:id/reject` `{ note }` (required) → `{ quote }` status `rejected`

### Admin — RFQs to route (admin user)
- `GET /admin/quotes?status=&rfq_id=&limit=20&offset=0` → `{ quotes: [Quote], count, limit, offset }` (all companies; `status=routing` = the queue, oldest first; else newest first)
- `GET /admin/quotes/:id` → `{ quote }` (with messages)
- `POST /admin/quotes/:id/route` `{ vendor_ids: ["ven_..."] }` (1–20, all **approved**, else 400) → `{ quote }` status `routed`. Creates one `requested` quote per vendor (same `rfq_id`, notes, incoterm, items copied as free text incl. `target_price`), emails each vendor `quote-requested` and the requester `quote-routed`. Vendor search: `GET /admin/vendors?q=&status=approved`.
- `POST /admin/quotes/:id/close` `{ note }` (required) → `{ quote }` status `rejected`, thread gets a `platform` message (note) + event `no_supplier`; requester emailed `quote-no-supplier`.
Both from `routing` only (400 otherwise); serialized by the same `quote-<id>` lock.

### Quote → order
On `accepted` the backend creates a **parent order** (Wholesale channel, customer = requester, items at `offered_unit_price`, exact decimal `quantity`, item `metadata { quote_id, quote_item_id, vendor_id, unit }`, order `metadata { quote_id, rfq_id, company_id }`, shipping address = company address, no shipping line) and emits `order.placed` → the P2 split creates the **vendor order** (shows in `GET /vendors/orders`; customer sees the parent in `GET /store/orders` + `GET /store/orders/:id/vendor-orders`) and sends the P2 order emails.
Payment: company `payment_mode = net_terms` → `pp_net-terms_net-terms` (credit check §4, failure = 400, quote stays as is); `upfront` → `pp_bank-transfer_bank-transfer` (bank instructions emailed; proof upload / admin confirm as P2).
**Decimal quantities**: order line items are Medusa `bigNumber` → `800.5` is stored, totalled (`800.5 × 11.10 = 8885.55`), split into the vendor order and fulfilled exactly (verified in tests). Cart line items are integers (`model.number()`), which is why fractional products stay quote-only.
Shipping: the order gets one shipping method on the vendor's first shipping option at price 0 ("Delivery as quoted (FOB)") so the vendor can mark it shipped as usual. A vendor with no shipping option can't ship until it adds one.

---

## 4. Net terms

`CreditAccount = { "id": "cred_01...", "company_id", "limit_usd": 50000, "terms_days": 30, "status": "active" | "on_hold" }`
`Invoice = { "id": "inv_01...", "company_id", "order_id", "display_id": 12, "amount": 8885.55, "currency_code": "usd", "due_date": "...", "status": "open" | "paid" | "overdue", "paid_at": null, "created_at" }`

Payment provider **`pp_net-terms_net-terms`** (region Egypt). **Listed only to eligible callers**: `GET /store/payment-providers`, `GET /store/regions*` and `/store/carts*` responses drop it from every `payment_providers` array unless the caller (customer token) is a member of a verified company with an `active` credit account. Hidden ≠ enforced: the checks below still run. Usable only when the cart's customer is a member of a **verified** company with an **active** credit account, no **overdue** invoice, and `outstanding (open + overdue invoices) + cart total ≤ limit_usd`. Checked when the cart completes (`POST /store/carts/:id/complete` → 400 `invalid_data`, e.g. `Credit limit exceeded: available USD 1200.00.` / `Net terms not available: overdue invoice.` / `Net terms not available for this account.`), and on quote acceptance for `net_terms` companies. The storefront can additionally grey it out when `GET /store/companies/me/credit` says `available < total`.
On `order.placed` with net terms → invoice `open`, `due_date = now + terms_days`.

- `GET /store/companies/me/credit` (member) →
  ```json
  { "credit_account": CreditAccount | null, "used": 8885.55, "available": 41114.45, "invoices": [Invoice] }
  ```
- `GET /admin/invoices?status=&company_id=&limit=20&offset=0` → `{ invoices: [Invoice & { company: { id, name } }], count, limit, offset }`
- `POST /admin/invoices/:id/mark-paid` → `{ invoice }` status `paid`; captures the order payment, vendor orders marked paid; account `on_hold` → `active` when no overdue invoice remains. 400 if already paid.
- Daily job (06:00): `open` invoices past `due_date` → `overdue`, credit account → `on_hold`, reminder email (EN/AR) to company admins for every overdue invoice (once per day).

---

## 5. Emails (Notification module, channel `email`)
| Event | To | Template |
|---|---|---|
| invitation | invitee | `company-invite` |
| company verified / rejected | company admins | `company-verified` / `company-rejected` |
| RFQ created | vendor owner | `quote-requested` |
| offer | requester | `quote-offered` |
| counter | vendor owner | `quote-countered` |
| message | other party | `quote-message` |
| buyer accept needs approval | approvers + admins | `quote-pending-approval` |
| ordered | vendor owner + requester | `quote-accepted` |
| rejected (either side) | other party | `quote-rejected` |
| expired | requester + vendor owner | `quote-expired` |
| routed by staff ("we found suppliers") | requester | `quote-routed` |
| closed by staff (no supplier found) | requester | `quote-no-supplier` |
| invoice overdue | company admins | `invoice-overdue` |

## 6. Admin UI (Medusa admin extensions, `/app`)
Sidebar routes **RFQs to route** (queue of `routing` quotes: items, buyer notes, searchable approved-vendor picker → route; close with note), **Companies** (list, filter, verify/reject with note, KYC download, payment mode, credit account), **Invoices** (filter, mark paid), **Vendors** (approve/reject/suspend, KYC download).
