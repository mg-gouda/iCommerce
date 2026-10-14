# P4 Backend API — money: platform fee, commission, payout ledger, vendor plans

Base URL `http://localhost:9000`. Medusa 2.21.2. Conventions as in [p1](p1-backend.md) / [p2](p2-backend.md) / [p3](p3-backend.md):
money in **major units USD** (`12.5` = USD 12.50), every computed amount rounded to cents (half up), ISO timestamps,
errors `{ type, message }`, another vendor's resource = **404**. Admin routes = admin user (session/bearer).

## 0. Setup
```
medusa db:migrate
medusa exec ./src/scripts/seed-defaults.ts          # + fee tiers (B2B, B2C), global commission 10%, plans Starter/Business/Enterprise (idempotent)
medusa exec ./src/scripts/backfill-vendor-plans.ts  # once: approved vendors without a subscription → Business, trial 60 days
```
| Env | Default | Meaning |
|---|---|---|
| `PAYOUT_HOLD_DAYS` | `7` | days after delivery before ledger entries become `available` |
| `PLAN_GRACE_DAYS` | `7` | days a `past_due` vendor keeps selling; after that: products hidden, portal product editing read-only |
| `ADMIN_NOTIFY_EMAIL` | unset | optional: upgrade requests are also emailed here (always shown in the admin notification feed) |

Jobs: `payout-release` (hourly, pending → available), `vendor-plans` (daily 05:00, trial/active past period end → `past_due` + email).

---

## 1. Platform buyer fee (module `fee`)

`FeeTier`
```json
{ "id": "fee_01...", "channel": "b2b" | "b2c", "basis": "monthly_volume" | "order_total",
  "min_amount": 10000, "percent": 6, "fixed_amount": 0, "min_fee": 250 | null, "max_fee": 6000 | null,
  "currency": "usd", "active_from": "…" | null, "active_to": "…" | null,
  "label_en": "Platform fee", "label_ar": "رسوم المنصة", "created_at", "updated_at" }
```

### Rules
- **Channel** = cart / order sales channel: `Wholesale` → `b2b`, anything else → `b2c`.
- **Subtotal** = Σ `unit_price × quantity` of the non-fee lines (before shipping, tax, discounts).
- **Base** per tier: `order_total` → subtotal. `monthly_volume` → buyer's volume this calendar month (UTC) + subtotal.
  Volume = Σ subtotals of the buyer's **parent** orders created this month, not canceled (= paid/processing; COD/bank/net-terms orders count from placement).
  Buyer = every member of the customer's company for `b2b` (customer alone if no company), the customer for `b2c` (guests: 0).
- **Tier** = among the channel's tiers active now (`active_from ≤ now < active_to`, nulls open), those with `min_amount ≤ base`; highest `min_amount` wins (ties: newest).
  No tier → no fee, no line.
- **Fee** = `clamp(subtotal × percent / 100 + fixed_amount, min_fee, max_fee)` (null bound = unbounded), rounded to cents. Cart without product lines → no fee.

Seeded (seed-defaults, idempotent by channel + min_amount):
| channel | basis | min_amount | percent | min_fee | max_fee | label |
|---|---|---|---|---|---|---|
| b2b | monthly_volume | 0 | 6 | 250 | 6000 | Platform fee / رسوم المنصة |
| b2b | monthly_volume | 10000 | 6 | 250 | 6000 | 〃 |
| b2b | monthly_volume | 20000 | 5 | 250 | 6000 | 〃 |
| b2b | monthly_volume | 30000 | 4 | 250 | 6000 | 〃 |
| b2b | monthly_volume | 40000 | 3 | 250 | 6000 | 〃 |
| b2c | order_total | 0 | 2 | – | – | Service fee / رسوم الخدمة |

Decision: B2B below the first WP tier (10k) = first tier (the `0` row). Admin can change/remove it.

### `PlatformFee` (snapshot shape)
```json
{ "amount": 533.13, "tier_id": "fee_01...", "channel": "b2b", "basis": "monthly_volume",
  "percent": 6, "fixed_amount": 0, "min_fee": 250, "max_fee": 6000, "min_amount": 0,
  "subtotal": 8885.55, "monthly_volume": 0,          // volume before this order (null for order_total)
  "base": 8885.55, "label_en": "Platform fee", "label_ar": "رسوم المنصة" }
```

### Carts (store)
The fee is a **custom line item** on the cart (no variant/product, `is_custom_price: true`, quantity 1, `requires_shipping: false`, `is_discountable: false`,
`title` = `label_en`, `unit_price` = fee) with `metadata.platform_fee: PlatformFee`. Medusa counts it in `item_total`/`subtotal`/`total`
and in the payment collection amount. It is recomputed on **every** cart change (add/update/delete line, customer or channel change, shipping method)
by a hook on `refreshCartItemsWorkflow` (`beforeRefreshingPaymentCollection`), so `cart.total` is always what the buyer pays.
- Identify it: `item.metadata?.platform_fee` present. Storefront: render it as its own row, never as a product (no quantity controls, not in item counts).
- Deleting / editing it is pointless: the next refresh restores it.
- `POST /store/carts/:id/complete` re-checks the fee (another order may have moved the monthly volume); if it changed, the line is updated and
  completion fails with 400 `Platform fee changed. Please review your cart.` → storefront re-fetches the cart and re-creates the payment session.

### Orders
The cart line becomes a **parent** order line (`metadata.platform_fee` = snapshot; later tier edits never change it). The vendor split
skips it (no vendor), so the fee is on the **parent only**, never on vendor orders, never in vendor `total`s or payouts.
Parent `total` = Σ vendor order totals + fee. Net-terms invoices = parent total (fee included).

Each vendor order gets `metadata.fee_share` = its pro-rata part of the fee by item subtotal (largest-remainder cents → shares sum exactly to the fee).
Only used for COD (§3). Not shown to buyers.

### Quotes
- Store quote responses (`GET /store/quotes`, `GET /store/quotes/:id` and every store quote action) carry `fee: PlatformFee | null`:
  live preview for open quotes with a `total` (b2b channel, the company's current monthly volume), the order's snapshot once `ordered`, `null` otherwise.
  The preview may change until accepted (volume moves); the order snapshot is final.
- Accept → order (P3 §3) adds the same fee line to the parent order. The net-terms credit check uses `total + fee`.
- Vendor quote routes do not include `fee`.

### Admin
| Route | Body / result |
|---|---|
| `GET /admin/fee-tiers?channel=` | `{ fee_tiers: [FeeTier] }` (channel, min_amount asc) |
| `POST /admin/fee-tiers` | FeeTier fields without id → `201 { fee_tier }` |
| `POST /admin/fee-tiers/:id` | partial → `{ fee_tier }` |
| `DELETE /admin/fee-tiers/:id` | `{ id, object: "fee_tier", deleted: true }` |
| `GET /admin/fee-tiers/preview?channel=b2b&subtotal=6000&monthly_volume=25000` | `{ fee: PlatformFee \| null }` (`monthly_volume` = prior volume, default 0) |

Validation (400): `percent` 0–100, amounts ≥ 0, `min_fee ≤ max_fee`, `active_from < active_to`, labels required.

---

## 2. Vendor commission (module `commission`)

`CommissionRule`
```json
{ "id": "comrule_01...", "scope": "global" | "plan" | "category" | "vendor" | "vendor_category",
  "scope_id": null | "plan_01…" | "pcat_01…" | "ven_01…" | "ven_01…:pcat_01…",
  "channel": "b2c" | "b2b" | "all", "percent": 10, "fixed_amount": 0, "min": null, "max": null,
  "active_from": null, "active_to": null, "note": null, "created_at", "updated_at" }
```
`vendor_category` `scope_id` = `<vendor_id>:<category_id>`. `global` has `scope_id: null`.

### Resolution (per vendor-order line)
Candidates: rules active at placement time whose channel is the order's channel or `all`, matching the line:
`vendor_category` (vendor + any of the product's categories) → `vendor` → `category` (any of the product's categories) → `plan` (vendor's plan) → `global`.
Most specific level wins; inside a level an exact channel beats `all`, then the newest rule. No rule → 0.
Commission = `clamp(line_subtotal × percent / 100 + fixed_amount, min, max)` rounded to cents (`fixed_amount` is **per line**). `line_subtotal = unit_price × quantity`.
Free-text quote lines (no product) have no categories → vendor / plan / global.

Seed: one `global`, channel `all`, 10%.

### Snapshot
At the P2 split every vendor-order line gets `metadata.commission`:
```json
{ "rule_id": "comrule_01...", "scope": "global", "percent": 10, "fixed_amount": 0, "min": null, "max": null, "amount": 6 }
```
and the vendor order `metadata.commission_total`. Later rule edits never change placed orders.
Vendor API (`VendorOrder`, P2 §6) adds `commission_total` and `items[].commission` (amount).

### Admin
| Route | Body / result |
|---|---|
| `GET /admin/commission-rules?scope=` | `{ commission_rules: [CommissionRule & { scope_label }] }` (`scope_label` = vendor / category / plan name) |
| `POST /admin/commission-rules` | fields without id → `201 { commission_rule }` |
| `POST /admin/commission-rules/:id` | partial → `{ commission_rule }` |
| `DELETE /admin/commission-rules/:id` | `{ id, object: "commission_rule", deleted: true }` |
| `GET /admin/commission-rules/resolve?vendor_id=&category_id=&channel=b2c&amount=100&date=` | `{ rule: CommissionRule \| null, commission: number, plan_id }` ("which rule applies" tester) |

---

## 3. Payout ledger (module `payout`)

`LedgerEntry`
```json
{ "id": "ledg_01...", "vendor_id": "ven_01...", "vendor_order_id": "order_01..." | null, "order_display_id": 12 | null,
  "type": "sale" | "commission" | "fee_collected" | "refund" | "payout" | "adjustment",
  "amount": -6.5, "currency_code": "usd", "status": "pending" | "available" | "paid",
  "available_at": "…" | null, "batch_id": "pbat_01..." | null, "note": "…" | null, "created_at" }
```
**Sign**: `amount` is from the vendor's point of view. **balance = Σ amount = what the platform owes the vendor** (negative = vendor owes the platform).

### Postings
On **delivered** (`POST /vendors/orders/:id/deliver`), once per vendor order (idempotent), `S` = vendor order `total` (items + vendor shipping + tax − discounts),
`C` = `commission_total`, `F` = `fee_share`:
| Payment | Entries |
|---|---|
| bank transfer / net terms | `sale +S`, `commission −C` |
| COD | `sale +S`, `commission −C`, `payout −S` (note `cod_cash`: the vendor's courier already collected it), `fee_collected −F` (fee collected on behalf of the platform) |

COD capture at delivery = `S + F` (vendor collects its goods + its fee share in cash). Bank transfer / net terms: the platform collects everything.

All delivery entries: `status = pending`, `available_at = delivered_at + PAYOUT_HOLD_DAYS`.
**Release job** (hourly): `pending` entries with `available_at ≤ now` whose vendor order is **paid** (`metadata.paid_at`: COD at delivery, bank transfer at confirm,
net terms at invoice mark-paid) → `available`.

**Refund after delivery** — `POST /admin/vendor-orders/:id/refund { amount, note? }` (amount > 0, ≤ S − already refunded; 400 unless delivered):
`refund −R`, `commission +round(C × min(R, item_total) / item_total)` (commission reversed pro-rata on items). The platform fee is **not** reversed.
Status: `available` if the order's sale entry is already available/paid, else `pending` with the same `available_at`.
ponytail: money moves manually (admin refunds the buyer from Medusa admin / bank); this route only books the vendor side.

### Payout batches
`PayoutBatch = { id: "pbat_01...", vendor_id, vendor: { id, name, handle }, amount, currency_code: "usd", status: "open" | "paid", reference: null | "TRX-1", paid_at: null, entry_count, created_at }`
- `POST /admin/payout-batches { vendor_id }` → `201 { batch }`: takes **every** `available` entry of the vendor without a batch (positive and negative), amount = their sum. 400 `Nothing to pay out.` when ≤ 0.
- `POST /admin/payout-batches/:id/mark-paid { reference }` → `{ batch }`: batch `paid`, its entries → `paid`, plus one `payout −amount` entry (`paid`, note = reference). 400 if already paid.
- `GET /admin/payout-batches?vendor_id=&status=&limit&offset` → `{ batches, count, limit, offset }`

### Admin reads
- `GET /admin/payouts/balances` → `{ balances: [{ vendor: { id, name, handle }, pending, available, balance }] }` (vendors with entries, by balance desc)
- `GET /admin/payouts/ledger?vendor_id=&type=&status=&limit=50&offset=0` → `{ entries: [LedgerEntry], count, limit, offset }` newest first

### Vendor (Bearer vendor token, own data only)
- `GET /vendors/payouts` → `{ summary: { pending, available, balance, owed, paid_total }, batches: [PayoutBatch] }`
  `available` = Σ available not yet in a batch, `pending` = Σ pending, `balance` = Σ unpaid entries, `owed = max(0, −balance)`, `paid_total` = Σ paid batches.
- `GET /vendors/payouts/ledger?type=&status=&limit=20&offset=0` → `{ entries, count, limit, offset }`

---

## 4. Vendor plans (module `vendor_plan`)

`Plan = { id: "plan_01...", handle: "starter", name_en, name_ar, price_usd: 0, interval: "monthly" | "yearly", product_limit: 50 | null (null = unlimited), staff_limit: 1 | null, featured_slots: 0, can_b2b: false, analytics_level: "basic" | "full", active: true }`
`VendorSubscription = { id: "vsub_01...", vendor_id, plan_id, plan: Plan, status: "trial" | "active" | "past_due" | "cancelled", current_period_start, current_period_end: … | null, requested_plan_id: null | "plan_…", read_only: boolean }`

Seed (by `handle`): **starter** (free, 50 products, 1 staff, no B2B, basic) · **business** (USD 49/month, 1000 products, 5 staff, B2B, full) · **enterprise** (USD 199/month, unlimited, unlimited staff, B2B, 5 featured slots, full).
A vendor **without** a subscription row is on **Starter** (active, no period) — new vendors start there (ponytail: no row created).
`backfill-vendor-plans` gives every approved vendor without a row **Business, trial, 60 days** (imported vendors included).

### Enforcement
- **Product limit**: `POST /vendors/products` → 400 `Plan limit reached: Starter allows 50 products. Upgrade your plan to add more.`; CSV import: rows past the limit are row errors with the same message.
- **`can_b2b = false`**: `PUT /vendors/products/:id/wholesale-tiers` with tiers → 400 `Your plan does not include B2B (wholesale tiers, quotes). Upgrade your plan.` (`[]` allowed);
  RFQ lines for such a vendor → 400 `<vendor name> does not accept quote requests.`; `vendorCanB2b()` (lib/plans) is the hook for platform-routed RFQs to skip them.
- **past_due**: during `PLAN_GRACE_DAYS` after `current_period_end` nothing changes (banner only). After → `read_only = true`:
  the vendor's products disappear from `/store/products*` (list + detail, non-destructive filter), from search (de-indexed; back on payment) and
  can't be added to carts (400); product create/edit/delete/import/tiers → 403 `Your plan is past due. Product editing is read-only until payment.`
  Orders, quotes and payouts keep working.
- `staff_limit`, `featured_slots`, `analytics_level`: stored + shown; nothing to enforce yet (no staff invites / featured / analytics in v1).

### Billing (manual)
Daily job: `trial`/`active` subscriptions on a paid plan with `current_period_end < now` → `past_due` + email `plan-past-due` (EN/AR) to the vendor owner.
Admin marks a period paid → `active`, period = from `max(now, current_period_end)` (now when past_due/trial) + 1 interval; optional plan change.

### Vendor
- `GET /vendors/plan` → `{ subscription: VendorSubscription, plan: Plan, usage: { products, staff }, plans: [Plan] (active), grace_until: … | null }`
- `POST /vendors/plan/upgrade-request { plan_id }` → `{ subscription }` (`requested_plan_id` set) + admin notification (feed + `ADMIN_NOTIFY_EMAIL`).
- `GET /vendors/me` adds `plan: { handle, name_en, name_ar, status, current_period_end, read_only, past_due }` for banners.

### Admin
| Route | Body / result |
|---|---|
| `GET /admin/plans` | `{ plans: [Plan & { subscribers }] }` |
| `POST /admin/plans` / `POST /admin/plans/:id` | Plan fields → `{ plan }` (no delete: set `active: false`) |
| `GET /admin/vendor-subscriptions?status=&limit&offset` | `{ subscriptions: [VendorSubscription & { vendor: {id,name,handle}, requested_plan }], count }` |
| `POST /admin/vendor-subscriptions { vendor_id, plan_id, status?, current_period_end? }` | upsert → `{ subscription }` (change plan / start trial) |
| `POST /admin/vendor-subscriptions/:id/mark-paid { plan_id? }` | `{ subscription }` (see Billing; clears `requested_plan_id`) |

---

## 5. Admin UI (`/app`, sidebar)
**Fee tiers** (per channel table, create/edit/delete, preview calculator) · **Commission** (rules CRUD, "which rule applies" tester) ·
**Payouts** (balances → vendor ledger + refund form, batches: create, mark paid) · **Plans** (plans CRUD, subscriptions, mark paid, change plan, upgrade requests).

## 6. Storefront contract (summary)
- Cart / checkout review: product lines = items **without** `metadata.platform_fee`; fee row = the item with it: label `label_en|label_ar`, amount `unit_price`,
  basis note from `basis/percent/min_fee/max_fee`. Totals: `item_total` (incl. fee) − fee = products subtotal; `shipping_total`; `total`.
- Order page: parent order items, same rule (`GET /store/orders/:id` with `items.metadata`; guest-status adds `fee: PlatformFee | null` to `order`).
- Quote page: `quote.fee`; total due = `quote.total + fee.amount`.

## 7. Worked examples (global 10% commission, hold 7 days)

**A. B2C COD, two vendors.** Vendor A: 2×10 + 2×20 = 60 + shipping 5 → S_A = 65. Vendor B: 2×7 = 14 + 5 → S_B = 19. Subtotal 74.
Fee 2% × 74 = **1.48**. Parent total = 65 + 19 + 1.48 = **85.48**. fee_share A = 1.48 × 60/74 = 1.20, B = 0.28 (sum 1.48).
Commission A = 6.00, B = 1.40. A delivers → capture 66.20. Ledger A:

| type | amount |
|---|---|
| sale | +65.00 |
| commission | −6.00 |
| payout (cod_cash) | −65.00 |
| fee_collected | −1.20 |
| **balance** | **−7.20** (A owes the platform) |

B delivers → capture 19.28; balance B = −1.68. Captures 66.20 + 19.28 = 85.48 = parent total.

**B. Same cart, bank transfer.** Admin confirms 85.48 (platform keeps 1.48). Ledger A: sale +65.00, commission −6.00 → **+59.00**; B: +19 −1.40 → **+17.60**.
Pending 7 days after delivery, then available. Batch A = 59.00 → mark paid `TRX-1` → payout −59.00, balance 0.

**C. B2B quote on net terms.** 800.5 × 11.10 = 8885.55, company volume this month 0 → base 8885.55 → tier ≥0 (6%) → 533.13 (inside 250–6000).
Parent total = **9418.68** (invoice amount). Commission 10% = 888.555 → **888.56**. Delivered: sale +8885.55, commission −888.56 (pending).
Stays pending until the invoice is marked paid **and** the hold passed → available **7996.99**.

**D. B2B monthly volume.** Prior volume 25,000, cart 6,000 → base 31,000 → tier ≥30k 4% → 240 → min **250**. Prior 45,000, cart 150,000 → 3% → 4,500.
Cart 250,000 → 7,500 → max **6,000**.

**E. Refund after delivery** (example B, vendor A refunds 20): refund −20.00, commission +2.00 (6.00 × 20/60) → A's balance 59.00 − 18.00 = **41.00**
(if already paid out: −18.00, netted in the next batch). Fee unchanged.

## 8. Ponytails / limits
- Fee line counts toward Medusa's `item_total`, so the P2 `free_over` shipping rule (cart `item_total`) includes the fee.
- Volume uses order creation month (UTC), not payment date; canceled orders drop out.
- Fee is not refunded on vendor cancel/refund (manual by admin if needed); a canceled COD vendor order's fee share is never collected.
- Vendor plan changes do not re-evaluate existing wholesale tiers.
- No adjustment route yet (`adjustment` type reserved); no batch delete (an open batch blocks those entries until paid).
