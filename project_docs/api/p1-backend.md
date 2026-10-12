# P1 Backend API — vendors, KYC, vendor products, admin approval

Base URL: `http://localhost:9000` (dev). All bodies JSON unless marked **multipart**.
Medusa v2.21.2. Money amounts are major units (`120` = USD 120.00). Timestamps ISO-8601 UTC.

## Conventions

**Errors** (Medusa standard):

```json
{ "type": "invalid_data" | "not_found" | "unauthorized" | "not_allowed", "message": "..." }
```

| HTTP | When |
|---|---|
| 400 `invalid_data` | body/query validation, unknown fields (`Invalid request: Unrecognized fields: 'status'`), business rule |
| 401 `{"message":"Unauthorized"}` | missing/invalid token, or token has no vendor actor |
| 404 `not_found` | missing resource **or another vendor's resource** (never 403, never leaks existence) |
| 400 `invalid_data` | unique conflicts, e.g. `Product with handle: shape, already exists.`, `Vendor with handle: acme, already exists.` (product handles are global across vendors) |

**Auth headers**: `Authorization: Bearer <token>`. Session cookies also accepted (`authenticate(..., ["session","bearer"])`) but the vendor portal should use bearer tokens.

**CORS**: `/vendors*` allows origins in `VENDOR_CORS` (dev `http://localhost:3001`), credentials on. `/auth/*` uses `AUTH_CORS`.

---

## 1. Vendor auth (Medusa built-in routes, actor type `vendor`)

Only the `emailpass` provider is enabled for vendors (`authMethodsPerActor.vendor = ["emailpass"]`).

### `POST /auth/vendor/emailpass/register`
Creates an auth identity. Returns a **registration token** (no actor yet) — only usable for `POST /vendors`.
```json
// req
{ "email": "owner@acme.com", "password": "Passw0rd!" }
// 200
{ "token": "eyJ..." }
```
Errors: 401 `{"type":"unauthorized","message":"Identity with email already exists"}` → the email already has an emailpass identity (e.g. it is a customer/admin, same password across actors — Medusa behaviour). Then call login below instead; a login token for an identity without a vendor actor works for `POST /vendors` (verified).

### `POST /auth/vendor/emailpass`
Login. After applying, the token carries `actor_id` = vendor_user id.
```json
// req
{ "email": "owner@acme.com", "password": "Passw0rd!" }
// 200
{ "token": "eyJ..." }
```
Errors: 401 `Invalid email or password`.

Other Medusa auth routes work for `vendor` as for any actor: `POST /auth/token/refresh`, `POST /auth/vendor/emailpass/reset-password`, `POST /auth/vendor/emailpass/update`, `POST /auth/session` / `DELETE /auth/session`.

**Flow**: register → `POST /vendors` with registration token → **login again** to get a token with the vendor actor → call `/vendors/*`.

---

## 2. Vendor (self-service)

### Object shapes

`Vendor`
```json
{
  "id": "ven_01...",
  "name": "Acme Plastics",
  "handle": "acme-plastics",
  "status": "pending" | "approved" | "suspended",
  "logo": "https://..." | null,
  "banner": "https://..." | null,
  "description": "string" | null,
  "phone": "string" | null,
  "email": "string" | null,
  "country": "EG" | null,          // ISO-3166 alpha-2
  "city": "string" | null,
  "tax_id": "string" | null,
  "commercial_reg_no": "string" | null,
  "export_card_no": "string" | null,
  "kyc_status": "none" | "submitted" | "verified" | "rejected",
  "kyc_note": "string" | null,     // admin's note on reject/suspend/approve
  "kyc_files": [ { "id": "private-1791627406909-cr.pdf", "filename": "cr.pdf", "mime_type": "application/pdf" } ] | null,
  "legacy_id": "string" | null,
  "created_at": "...", "updated_at": "...", "deleted_at": null
}
```
`kyc_files[].id` is a private file key — there is **no URL**; only admins can download (see 4.4).

`VendorUser`
```json
{
  "id": "venusr_01...",
  "email": "owner@acme.com",
  "first_name": "Ali" | null,
  "last_name": "string" | null,
  "role": "owner" | "staff",
  "vendor_id": "ven_01...",
  "created_at": "...", "updated_at": "...", "deleted_at": null
}
```

### `POST /vendors` — apply
Auth: registration/login token for actor `vendor` **without** an existing vendor actor.
```json
// req (all optional except name; unknown fields → 400)
{
  "name": "Acme Plastics",
  "handle": "acme-plastics",       // optional, lowercase-kebab; default = slug of name
  "logo": "https://...", "banner": "https://...",
  "description": "...", "phone": "+20...", "email": "sales@acme.com",
  "country": "EG", "city": "Cairo",
  "first_name": "Ali", "last_name": "Hassan"
}
// 201
{ "vendor": Vendor /* status "pending", kyc_status "none", users: [] */, "user": VendorUser /* role "owner" */ }
```
- `user.email` is taken from the auth identity, never the body. `vendor.email` defaults to it.
- `status`, `kyc_*`, `legacy_id` cannot be set.

Errors: 400 `Request already authenticated as a vendor.` (token already has a vendor actor) · 400 validation · 401 no token · 400 `Vendor with handle: x, already exists.`

### `GET /vendors/me`
Auth: vendor. Works for every vendor status.
```json
// 200
{ "vendor": Vendor, "user": VendorUser }
```

### `POST /vendors/me` — update profile
Auth: vendor (any status). Partial update. Allowed fields only: `name, logo, banner, description, phone, email, country, city` (same validation as apply). Anything else (e.g. `status`, `handle`, `kyc_status`) → 400 `Unrecognized fields`.
```json
// req
{ "description": "We make pipes", "logo": "http://localhost:9000/static/1791...-logo.png" }
// 200
{ "vendor": Vendor, "user": VendorUser }
```

### `POST /vendors/me/kyc` — submit KYC (**multipart/form-data**)
Auth: vendor (any status).

| Field | Type | Rules |
|---|---|---|
| `tax_id` | text | required, non-empty |
| `commercial_reg_no` | text | required, non-empty |
| `export_card_no` | text | required, non-empty |
| `files` | file (repeat field) | 1–10 files, ≤10 MB each, `application/pdf`, `image/png`, `image/jpeg`, `image/webp` (others silently dropped) |

```json
// 200
{ "vendor": Vendor /* kyc_status "submitted", kyc_note null, kyc_files replaced */ }
```
Errors: 400 missing numbers · 400 `At least one KYC file is required.`
Resubmitting replaces `kyc_files` and resets `kyc_status` to `submitted` (even if previously `verified`/`rejected`).

### `POST /vendors/uploads` — product/profile images (**multipart/form-data**)
Auth: vendor. Field `files` (1–10, ≤5 MB, png/jpeg/webp/gif). Files are **public**.
```json
// 200
{ "files": [ { "id": "1791627438559-p.png", "url": "http://localhost:9000/static/1791627438559-p.png" } ] }
```
Use `url` in product `images[].url` / `thumbnail`, or vendor `logo` / `banner`.
Errors: 400 `No files were uploaded`.

---

## 3. Vendor products

Every route here is scoped to the caller's vendor. A product owned by another vendor returns **404** exactly like a non-existent one.

### Status rules
Product `status` ∈ `draft | proposed | published | rejected` (Medusa). `proposed` = "pending review".

| Vendor status | Requested status | Stored |
|---|---|---|
| approved | `published` | `published` |
| approved | `draft` / `proposed` | same |
| approved | omitted (update) | unchanged |
| approved | omitted (create) | `draft` |
| pending / suspended | `draft` | `draft` |
| pending / suspended | anything else or omitted | `proposed` |

So any edit by a non-approved vendor un-publishes the product (→ `proposed`). `rejected` can't be set by vendors (→ `proposed`).

Sales channels are assigned by the platform: always **Wholesale**; also **Retail** unless `extra.b2b_only = true` or `extra.b2c_enabled = false`. Vendors cannot send `sales_channels` or `shipping_profile_id`.

### `ProductExtra` (`extra` in requests, `product_extra` in responses)
```json
{
  "unit": "ton" | null,            // free text: ton, m2, piece, kg...
  "min_qty": 5 | null,             // positive int
  "max_qty": 100 | null,           // positive int
  "qty_step": 5 | null,            // positive int
  "hs_code": "7304" | null,
  "cost_price": 80.5 | null,       // >= 0, vendor-private
  "b2b_only": false,               // default false
  "b2c_enabled": true,             // default true
  "origin_country": "EG"           // 2 letters, default "EG"
}
```
Response adds `id` (`pext_...`), `legacy_id`, `raw_cost_price`, timestamps.

### `VendorProduct` (response)
Medusa product with: `*`, `variants.*`, `variants.prices.*`, `options.*`, `options.values.*`, `images.*`, `categories.{id,name,handle}`, `sales_channels.{id,name}`, `product_extra.*`.
```json
{
  "id": "prod_01...", "title": "Steel pipe", "handle": "steel-pipe", "subtitle": null, "description": null,
  "status": "published", "thumbnail": null, "metadata": null, "is_giftcard": false, "discountable": true,
  "weight": null, "length": null, "height": null, "width": null,
  "origin_country": null, "hs_code": null, "mid_code": null, "material": null,
  "type_id": null, "collection_id": null, "external_id": null,
  "created_at": "...", "updated_at": "...", "deleted_at": null,
  "variants": [ { "id": "variant_01...", "title": "Default", "sku": null, "manage_inventory": true, "allow_backorder": false,
                  "prices": [ { "id": "price_01...", "currency_code": "usd", "amount": 120, "min_quantity": null, "max_quantity": null } ] } ],
  "options": [ { "id": "opt_01...", "title": "Default", "values": [ { "id": "optval_01...", "value": "Default" } ] } ],
  "images": [ { "id": "img_01...", "url": "https://...", "rank": 0 } ],
  "categories": [ { "id": "pcat_01...", "name": "Plastics", "handle": "plastics" } ],
  "sales_channels": [ { "id": "sc_01...", "name": "Retail" }, { "id": "sc_01...", "name": "Wholesale" } ],
  "product_extra": ProductExtra & { "id": "pext_01..." } | null
}
```
Use `product_extra.hs_code` / `origin_country` (the native Medusa `hs_code`/`origin_country` stay null).

### `GET /vendors/products`
Query: `q` (text search on title etc.), `status` (`draft|proposed|published|rejected`), `limit` (1–100, default 20), `offset` (default 0). Ordered newest first.
```json
// 200
{ "products": [VendorProduct], "count": 42, "limit": 20, "offset": 0 }
```

### `POST /vendors/products` — create
Body = Medusa admin create-product body minus `sales_channels`/`shipping_profile_id`, plus `extra`. Unknown fields → 400.
```json
{
  "title": "Steel pipe",                     // required
  "handle": "steel-pipe",                    // optional, globally unique; default slug(title)
  "subtitle": null, "description": "Seamless pipe",
  "status": "published",                     // see Status rules
  "thumbnail": "https://...", "images": [ { "url": "https://..." } ],
  "categories": [ { "id": "pcat_01..." } ],
  "tags": [ { "id": "ptag_01..." } ],
  "metadata": { },
  "options": [ { "title": "Default", "values": ["Default"] } ],
  "variants": [ {
    "title": "Default",
    "sku": "PIPE-1",
    "options": { "Default": "Default" },
    "prices": [ { "currency_code": "usd", "amount": 120 } ],
    "manage_inventory": false
  } ],
  "weight": 1000,
  "extra": ProductExtra
}
```
Simple product = one option `Default` with value `Default` and one variant mapping it (as above). For variants, add real options (`Size: [S, M]`) and one variant per combination.
```json
// 201
{ "product": VendorProduct }
```
Errors: 400 validation · 400 `Product with handle: steel-pipe, already exists.`

### `GET /vendors/products/:id`
```json
// 200
{ "product": VendorProduct }
```
404 if not yours / missing.

### `POST /vendors/products/:id` — update
Body = Medusa admin update-product body minus `sales_channels`/`shipping_profile_id`, plus optional `extra` (partial; creates the extra row if missing). All fields optional. Note Medusa 2.16+: `options` not allowed on update (use variants/option routes later); `variants` items need `id` to update existing ones.
```json
// req
{ "title": "Renamed", "status": "published", "extra": { "unit": "m2", "b2b_only": true } }
// 200
{ "product": VendorProduct }
```
Errors: 404 not yours · 400 validation.

### `DELETE /vendors/products/:id`
```json
// 200
{ "id": "prod_01...", "object": "product", "deleted": true }
```
Soft-deletes the product; its `product_extra` and vendor link go with it; removed from search.

### `POST /vendors/products/import` — CSV import (**multipart/form-data**)
| Field | Rules |
|---|---|
| `file` | CSV, ≤5 MB, ≤1000 data rows, UTF-8 (BOM ok), header row required |
| `status` | optional `draft` (default) / `proposed` / `published`; gated by Status rules |

Columns (header names exact, order free, extra columns ignored):

| Column | Req | Format |
|---|---|---|
| `handle` | – | lowercase-kebab; default slug(title); must be globally unique |
| `title` | ✔ | text |
| `description` | – | text |
| `category_handle` | – | existing category handle |
| `price_usd` | ✔ | number ≥ 0 |
| `compare_at_usd` | – | number ≥ 0 → stored in `metadata.compare_at_usd` |
| `unit` | – | text |
| `min_qty` | – | positive int |
| `qty_step` | – | positive int |
| `hs_code` | – | text |
| `b2b_only` | – | `true/false/1/0/yes/no/y/n` |
| `image_urls` | – | `\|`-separated URLs; first = thumbnail |

Each valid row creates a simple product (one `Default` variant, USD price). Rows are independent: a bad row never blocks others.
```json
// 200 (even when some rows fail)
{
  "created": [ { "row": 2, "id": "prod_01...", "handle": "good-1" } ],
  "errors":  [ { "row": 3, "handle": "bad-1", "errors": ["title is required", "price_usd must be a number >= 0", "unknown category_handle \"nope\""] } ]
}
```
`row` = CSV line number (header is line 1). Errors: 400 `CSV file is required (field \`file\`).` · 400 `Invalid CSV: ...` · 400 `Max 1000 rows per file.`

---

## 4. Admin (actor `user`, Medusa admin auth)

Login: `POST /auth/user/emailpass` `{ email, password }` → `{ token }`. All `/admin/*` require it.

### 4.1 `GET /admin/vendors`
Query: `q` (matches vendor `name`), `status` (`pending|approved|suspended`), `kyc_status` (`none|submitted|verified|rejected`), `limit` (1–100, default 20), `offset`.
```json
// 200
{ "vendors": [Vendor & { "users": [VendorUser] }], "count": 3, "limit": 20, "offset": 0 }
```

### 4.2 `GET /admin/vendors/:id`
```json
// 200
{ "vendor": Vendor & { "users": [VendorUser] } }
```
404 if missing.

### 4.3 `POST /admin/vendors/:id/{approve|reject|suspend}`
```json
// req
{ "note": "optional text" }        // required (non-empty) for reject
// 200
{ "vendor": Vendor }
```
| Action | Effect |
|---|---|
| `approve` | `status=approved`, `kyc_status=verified`, `kyc_note=note|null` |
| `reject` | `kyc_status=rejected`, `kyc_note=note` (status unchanged; vendor can resubmit KYC) |
| `suspend` | `status=suspended`, `kyc_note=note|null` (products stay as-is; any vendor edit → `proposed`) |

Errors: 400 `note is required when rejecting` · 404 vendor missing · 404 `Unknown action "x"`.

### 4.4 `GET /admin/vendors/:id/kyc-files/:file_id`
Streams a private KYC file (`Content-Type` = stored mime, `Content-Disposition: attachment`). `file_id` = `kyc_files[].id` (URL-encode it). 404 if the id isn't in that vendor's `kyc_files`.

---

## 5. Search (Meilisearch, read directly by storefront)

Index `products`, primary key `id`, **published products only**, synced by subscriber on `product.created|updated|deleted`. Reindex: `medusa exec ./src/scripts/sync-search.ts` (also applies settings below — run once per environment).

Document:
```json
{
  "id": "prod_01...", "title": "Steel pipe", "handle": "steel-pipe", "description": "...", "thumbnail": null,
  "vendor_name": "Acme", "vendor_handle": "acme",
  "category_names": ["Plastics"],
  "hs_code": "7304", "unit": "ton", "origin_country": "EG",
  "b2b_only": false, "b2c_enabled": true,
  "price_min": 120, "price_max": 120          // USD across variants, null if none
}
```
Searchable: `title, description, vendor_name, category_names, hs_code`. Filterable: `vendor_handle, category_names, unit, origin_country, b2b_only, b2c_enabled, price_min, price_max`. Sortable: `price_min, price_max`.
Known gap: vendor rename / category rename don't reindex until the product changes or `sync-search` runs.

---

## 5b. Storefront (public, `x-publishable-api-key` required like all `/store/*`)

### `GET /store/vendors/:handle`
Public store profile. **Approved vendors only**; pending, suspended and missing handles all return the same 404.
```json
// 200
{ "vendor": { "id": "ven_01...", "name": "Acme", "handle": "acme", "logo": null, "banner": null,
              "description": "...", "city": "Cairo", "country": "EG", "kyc_status": "verified" } }
// 404
{ "type": "not_found", "message": "Vendor acme not found" }
```
Vendor's products: read the search index with filter `vendor_handle = "acme"` (published only; the core store API cannot filter by vendor).

### Extra fields on `GET /store/products` / `GET /store/products/:id`
Request with `fields=+product_extra.unit,+vendor.name,...`. Allowed exact paths only (so `cost_price` stays private):
`product_extra.{unit,min_qty,max_qty,qty_step,hs_code,b2b_only,b2c_enabled,origin_country}`, `vendor.{name,handle,logo,city,country,status,kyc_status}`. Anything else under these relations is silently dropped.

---

## 6. Seeded defaults (`medusa exec ./src/scripts/seed-defaults.ts`)
- Store currencies: USD (default), EGP.
- Region `Egypt`: currency **USD**, country `eg`, payment provider `pp_system_default`.
- Sales channels `Retail`, `Wholesale`, each with a publishable key titled `Retail storefront` / `Wholesale storefront` (tokens printed by the script). Storefront uses the key as `x-publishable-api-key` for `/store/*`.

Demo data (local dev / E2E only): `medusa exec ./src/scripts/seed-demo.ts` → categories `carpets-rugs`, `cookware`; approved vendors `demo-nile-looms`, `demo-helwan-metal` × 6 published products each (handles `demo-*`, `metadata.demo = true`). Idempotent by handle. Then run `sync-search`.

Categories: `medusa exec ./src/scripts/seed-categories.ts <file.json>`, file shape `[{ "legacy_id", "name", "handle", "parent_legacy_id" | null }]`, idempotent by handle, `legacy_id` → category `metadata.legacy_id`. Storefront reads them via core `GET /store/product-categories`.
