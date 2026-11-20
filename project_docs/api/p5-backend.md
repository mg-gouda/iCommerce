# P5 Backend API: reports and sales org (P5a)

Conventions are the same as [p1](p1-backend.md) to [p4](p4-backend.md):
- money is in **major units USD**, rounded to cents
- timestamps are ISO; days are **UTC** `YYYY-MM-DD`
- errors are `{ type, message }`
- another vendor's resource returns **404**
- admin routes require an admin user

Chat (TalkJS) is **P5b** and is blocked on the owner's TalkJS app ID and secret key. It is out of scope here.

## 0. Setup
```
medusa db:migrate
medusa exec ./src/scripts/rebuild-reports.ts     # full backfill of report_line (idempotent; safe to re-run)
```
| Job | Schedule | Does |
|---|---|---|
| `reports-nightly` | daily 02:00 UTC | rebuilds facts for child orders updated in the last 48 h (safety net for missed events) |

---

## 1. Sales org (module `sales_org`)

```
Branch      { id, code (unique), name, legacy_id | null }
SalesRep    { id, type: "branch_manager" | "account_manager" | "broker", code (unique per type), name,
              email | null, branch_id | null, manager_id | null (→ SalesRep), legacy_id | null, active: true }
Assignment  { id, target_type: "company" | "customer" | "vendor", target_id,                       // unique (target_type, target_id)
              branch_id | null, branch_manager_id | null, account_manager_id | null, broker_id | null }
```
Rules:
- `manager_id` on an account manager or broker points to a branch manager. A branch manager's `branch_id` gives the branch.
- When an assignment sets only some fields, the missing ones are derived **at write time** by walking the tree (broker or account manager → manager → branch). The stored row is complete.
- **Attribution on order** (`order.placed`, parent order) uses the first assignment found:
  1. the customer's **company** assignment
  2. the **customer** assignment
  3. none

  The result is copied to the parent order and every vendor child order as `metadata.sales_attribution`:
  `{ branch_id, branch_manager_id, account_manager_id, broker_id, source: "company"|"customer" }`.
  Later reassignment **does not** rewrite old orders.
- Vendor assignments are stored for admin reference only. They are not used for attribution.

Admin routes (all return `{ <resource> }` or a list as `{ <resources>, count, offset, limit }`):
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/admin/sales-org/branches` | |
| POST/DELETE | `/admin/sales-org/branches/:id` | delete → 409 if reps or assignments reference it |
| GET/POST | `/admin/sales-org/reps` | filter `type`, `branch_id`, `q` |
| POST/DELETE | `/admin/sales-org/reps/:id` | delete → 409 if referenced; prefer `active:false` |
| GET | `/admin/sales-org/assignments?target_type=&target_id=` | |
| PUT | `/admin/sales-org/assignments` | upsert by (target_type, target_id); body ids validated (404 unknown) |
| DELETE | `/admin/sales-org/assignments/:id` | |

Admin UI: a **Sales org** page with branches, reps (tree) and assignments. A company detail shows its assignment and lets admin edit it.

**WP import** (`import-wp.ts` step 6): branches, then reps (resolving `manager_code` to `manager_id`, and `branch_code`), then assignments. Each assignment's `user_legacy_id` is mapped to its company if the imported customer belongs to one, else to the customer, or to the vendor when `is_vendor`. Unknown codes are counted in the report rather than failing. The import is idempotent by `legacy_id`.

---

## 2. Report facts (one table, rebuilt per order)

`report_line`: one row per **line item of a non-canceled vendor child order**.
```
{ id, order_id (child), parent_order_id, vendor_id, day (UTC date of parent created_at), channel: "b2b"|"b2c",
  product_id | null, variant_id | null, category_id | null (first category), country_code | null (shipping address),
  customer_id | null, company_id | null, buyer_label (company name → customer full name → email),
  quantity (numeric), gross (unit_price × qty), commission, fee_share,
  paid (bool), branch_id, branch_manager_id, account_manager_id, broker_id }
```
- `rebuildOrderFacts(childOrderId)` deletes the order's rows and re-inserts them in one transaction. It is fully recomputed, never incremented.
- It is called on `order.placed` (after the split), vendor cancel/accept/ship/deliver actions, payment marked paid, and order canceled. Canceled orders have 0 rows.
- `fee_share` is the child order's `metadata.fee_share`, split across its lines pro rata by gross. Cents are rounded and the residual goes to the largest line, so Σ = fee_share exactly.
- `commission` is per line, from `items.metadata.commission.amount`.
- The fee line itself (platform fee item on the parent) is **not** a fact row. The platform fee total for admin comes from Σ `fee_share` of facts plus parent fee lines of orders with no vendor (there are none today). Decision: **admin fees = Σ fee_share**.
- `report_line` is a plain table in the `sales_org` module or a small `report` module. Pick one, keep it local, and query it with knex/raw SQL for the GROUP BYs.

Definitions used everywhere:
| Metric | = |
|---|---|
| revenue (gross) | Σ gross |
| orders | count distinct order_id |
| AOV | revenue / orders (0 if none) |
| units | Σ quantity |
| commission | Σ commission |
| net (vendor) | revenue − commission − fee_share |
| GMV (admin) | Σ gross over all vendors |

Filters on every report: `from`, `to` (inclusive UTC days; default = last 30 days ending today), `channel` (`b2b`|`b2c`|omitted = both), `paid` (`true` = paid only; default all non-canceled).

---

## 3. Vendor reports (auth: vendor actor, scoped to own `vendor_id`)

`GET /vendors/reports/summary?from&to&channel&paid&interval=day|week|month`
```json
{ "range": { "from": "2026-10-01", "to": "2026-10-31" },
  "kpis": { "revenue": 12500.5, "orders": 42, "aov": 297.63, "units": 310.5, "commission": 1250.05, "fee_share": 80, "net": 11170.45,
            "open_quotes": 3, "unread_chats": null },
  "previous": { "revenue": …, "orders": …, "aov": …, "units": … },          // same-length range immediately before
  "series": [ { "period": "2026-10-01", "revenue": 410, "orders": 2 }, … ] }  // every period present, zero-filled
```
`interval` defaults to day for ranges of 62 days or less, otherwise month. Week starts Monday. `unread_chats` = unread TalkJS conversations for the vendor; `null` when chat is disabled or TalkJS is unreachable.

`GET /vendors/reports/breakdown?by=product|category|country|channel|buyer&from&to&channel&paid&limit=50&offset=0`
```json
{ "by": "product", "rows": [ { "key": "prod_…", "label": "…", "revenue": …, "orders": …, "units": …, "share": 0.31 } ], "count": 120, "total": { "revenue": …, "orders": …, "units": … } }
```
- `label`: the product title, category name (in the request's `locale` if available, else the default), country code, channel, or `buyer_label`.
- Sort: revenue desc, then key.
- `share` = row revenue / total revenue.

CSV: `format=csv` on both routes returns `text/csv` with a header row (UTF-8 with BOM so Excel shows Arabic). Pagination is ignored and all rows are returned. Filename: `icommerce-<by|summary>-<from>-<to>.csv`.

Vendor portal:
- The **Dashboard** has KPI tiles with the delta vs the previous period, a revenue chart, top 5 products, and open quotes.
- **Reports** has tabs for period / product / category / country / channel / buyer, a date range (presets 7d, 30d, 90d, 12m, custom), and a CSV button.
- Charts are plain SVG with no chart dependency, accessible (each chart has a table fallback), EN + AR, and RTL-correct.

---

## 4. Admin reports (auth: admin)

`GET /admin/reports/summary?from&to&channel&paid&interval` has the same shape as the vendor summary, with:
- kpis `{ gmv, orders, aov, units, commission, fees, active_vendors (≥1 order in range), new_vendors, new_companies }`
- no `open_quotes` / `unread_chats`

`GET /admin/reports/breakdown?by=vendor|branch|branch_manager|account_manager|broker|channel|category|country|buyer&…` has the same shape as the vendor breakdown, with extra columns `commission` and `fees`. Rows with a null attribution key show as `key: null, label: "Unassigned"`. CSV works the same.

Admin UI: a **Reports** page with KPI tiles, a GMV chart, and a breakdown table with a `by` picker and CSV.

Deferred (ponytail): rep logins scoped to their branch, and refunds in reports (refunds are manual).

---

## 4b. Implementation notes (as built)
- `report_line` lives in the `sales_org` module. `day` is stored as text `YYYY-MM-DD`; money/quantity columns are `numeric` (plus Medusa's `raw_*` jsonb).
- Facts are rebuilt after **every** vendor order action (fulfill, deliver, cancel, return-request), admin confirm-transfer, invoice mark-paid, `order.placed` and `order.canceled`. A parent id rebuilds all its children.
- Admin summary: `previous` is `{ gmv, orders, aov, units }` (keys match `kpis`). `series` uses `revenue` (= GMV) on both vendor and admin.
- Null keys: `key: null, label: "Unassigned"` on vendor breakdowns too (the portal shows its own translated label).
- `by=buyer` key = company id, else customer id, else `buyer_label` (guests).
- `share` is rounded to 4 decimals. `limit` max 500.
- `open_quotes` = vendor quotes in `requested | vendor_review | offered | negotiating | pending_approval`.
- `locale` is accepted but ignored: categories have no translations yet (ponytail).
- Vendor CSV downloads go through the portal route `/api/reports/csv` (the vendor JWT is an httpOnly cookie).
- WP import: a non-vendor `user_legacy_id` is matched to a customer via `customer.metadata.legacy_id`. Customers aren't imported yet, so those rows are counted as `assignments skipped: customer not imported`.

## 5. Tests (integration, `p5-reports.spec.ts`)
- A seeded month with a hand-computed expected table covering:
  - 2 vendors, B2B and B2C
  - one canceled order, one unpaid COD order, a decimal quantity line
  - one company-attributed buyer and one customer-attributed buyer

  Summary, every breakdown, and the CSV totals equal the expected values **to the cent**.
- Isolation: vendor A never sees vendor B's rows (summary, breakdown, CSV). Admin routes return 401 for the vendor/customer actor.
- Rebuild is idempotent: running `rebuild-reports` twice gives identical rows. Canceling an order removes its rows.
- Attribution: a company assignment beats a customer assignment, and later reassignment does not change old orders.
- Sales org: derived fields are filled at write time, and delete returns 409 when the record is referenced.
- WP import of `sales_org.json` from the fixture (extend the fixture with a small sanitized sample).
