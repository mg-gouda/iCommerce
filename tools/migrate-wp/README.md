# @icommerce/migrate-wp

One-off WP (WooCommerce + WCFM) → iCommerce migration. **Stage 1 = extract + normalize** the legacy SQL dump into JSON under `out/`. Stage 2 (importer) reads `out/`.

`out/` holds PII (emails, phones, tax IDs, staff names). It is gitignored. Never commit it, the dump, or `wp-config.php`. Password hashes, orders, sessions, analytics, logs, and form entries are not extracted.

## Run

```sh
# 1. throwaway DB (local only, any free port; default 3317)
docker run -d --name wp-migrate-db -p 127.0.0.1:3317:3306 \
  -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 -e MARIADB_DATABASE=wp \
  mariadb:10.8.3 --max-allowed-packet=256M --innodb-flush-log-at-trx-commit=0
docker exec wp-migrate-db mysqladmin ping --wait=30

# 2. load dump (~2 min)
docker exec -i wp-migrate-db mysql -uroot wp < "Old WP Project/marketplace/gosoor_wp_xlqxx.sql"

# 3. extract (~10 s); re-runs are idempotent and byte-identical
pnpm --filter @icommerce/migrate-wp extract
pnpm --filter @icommerce/migrate-wp test

# 4. cleanup
docker rm -f wp-migrate-db
```

Env (all optional): `WP_DB_PORT` (3317), `WP_DB` (wp), `WP_PREFIX` (`wWWvr_`), `WP_UPLOADS` (comma-separated upload roots searched in order, absolute or relative to repo root; default `Old WP Project/marketplace/wp-content/uploads,Old WP Project/recovered-uploads`; the second holds 2022/03–06 originals recovered from the Jun-2022 `.wpress`).

## Output (`out/`)

All arrays sorted by `legacy_id` (images by `path`). `legacy_id` = WP ID, use it as the import idempotency key.

| file | shape |
|---|---|
| `categories.json` | `[{legacy_id, name, handle, parent_legacy_id, product_count}]`: `product_cat` terms; entities decoded, ALL-CAPS names title-cased |
| `vendors.json` | `[{legacy_id, store_name, handle, email, phone, country, city, address, description, logo_path, banner_path, tax_id, commercial_reg_no, export_card_no, registered_at, membership_plan, product_count}]`: users with role `wcfm_vendor` |
| `products.json` | `[{legacy_id, vendor_legacy_id, status, title, handle, description_html, short_description_html, sku, regular_price, sale_price, currency, category_legacy_ids, tags, attributes, min_qty, max_qty, qty_step, hs_code, cost_price, vendor_product_link, image_paths, created_at}]`: status `publish` + `pending`. `attributes` = `{key: string[]}` (`unit`, `color`, `size`, `lead_time`…); `hs_code` comes from `pa_hs-code` |
| `sales_org.json` | `{branches:[{legacy_id, code, name}], reps:[{type, legacy_id, code, name, branch_code, manager_code}], assignments:[{user_legacy_id, is_vendor, branch_code, branch_manager_code, account_manager_code, broker_code}]}`: `type` ∈ `branch_manager` (→ `branch_code`), `account_manager` / `broker` (→ `manager_code` = a branch manager's `code`) |
| `fee_tiers.json` | `[{legacy_id, channel, basis, min_orders, min_amount, percent, min_fee, max_fee, currency}]` from `intermediation_fees` |
| `images.json` | `{images:[{path, bytes, sha256, used_by}], missing:[{path, used_by}]}`: paths relative to uploads/, originals only (`-WxH` / `-scaled` stripped when the original exists); `used_by` = `product:<id>` / `vendor:<id>` |
| `report.md` | counts vs audit, field coverage, duplicates, data issues, image totals |

Dates are ISO UTC strings. Prices are numbers (USD) or `null`.

## Stage 2: import (`apps/backend/src/scripts/import-wp.ts`)

```sh
cd apps/backend   # .env: DATABASE_URL, REDIS_URL, MEILI_* (MEILI_INDEX optional), WP_OUT=<abs path to out/>
npx medusa exec ./src/scripts/import-wp.ts [out-dir] -- [--limit N] [--only vendors|products]
```

Seeds defaults + categories, then vendors (+ owner `vendor_user`, no login yet), images (File module, once per sha256), products (+ `product_extra`, vendor link), then reindexes search. Idempotent by `legacy_id`; unchanged rows are skipped via `metadata.import_hash`, so re-runs are cheap and resumable. Writes `out/image-map.json` (sha → uploaded URL; delete when switching file provider) and `out/import-report.md` (counts only). Sales org + fee tiers are only counted until their modules exist.

## Known gaps

- The `uploads/` copy has no `2022/03` or `2022/06`–`09` folders, so ~78% of referenced originals are listed in `images.json` `missing[]`. Most of them (~10k) are inside `wp-content/ai1wm-backups/*.wpress` (2022-06-29), which is a plain tar-like format with a 4377-byte header per file. Stage 2 can pull them from there.
- KYC numbers: the `tax-id-number` / `commercial-registration-number` / `export-card-number` keys are nearly empty, so they fall back to the registration-form keys `tax-id` / `commercial-registration-id-no` / `export-card-no`.
- `membership_plan` is always `null`: all 5 WCFM subscriptions are cancelled and point at a deleted plan.
- Variations (19) are not exported. A variable parent with no price gets its cheapest variation price.
