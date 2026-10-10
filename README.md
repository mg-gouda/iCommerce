# iCommerce

Multi-vendor B2B + B2C marketplace. Turborepo + pnpm monorepo. Planning docs in [`project_docs/`](project_docs), product brief in [`PRODUCT.md`](PRODUCT.md), design system in [`design-system/`](design-system).

## Apps & packages

| Path | What | Port |
|---|---|---|
| `apps/backend` | Medusa v2 API + Admin (`/app`), custom `vendor` module | 9000 |
| `apps/storefront` | Next.js storefront, EN/AR (`/en`, `/ar`, RTL) | 3000 |
| `apps/vendor` | Next.js vendor portal, EN/AR | 3001 |
| `packages/ui` | React components + Tailwind v4 theme generated from `design-system/tokens.json` | |
| `packages/sdk` | Configured `@medusajs/js-sdk` client | |
| `packages/config` | Shared tsconfig + ESLint config | |

Infra (`docker-compose.yml`): Postgres 5432, Redis 6379, Meilisearch 7700. Host ports override via `PG_PORT`, `REDIS_PORT`, `MEILI_PORT` (then update `apps/backend/.env` to match).

## Run

Requires Node 22+, pnpm 10, Docker.

```sh
docker compose up -d
pnpm i
cp apps/backend/.env.example apps/backend/.env
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/vendor/.env.example apps/vendor/.env.local
pnpm --filter @icommerce/backend db:migrate
pnpm --filter @icommerce/backend exec medusa user -e admin@example.com -p <password>   # first admin user
pnpm dev
```

- Storefront: http://localhost:3000/en · http://localhost:3000/ar
- Vendor portal: http://localhost:3001/en/login · http://localhost:3001/en/dashboard
- Medusa Admin: http://localhost:9000/app · health: http://localhost:9000/health
- Vendor + admin vendor API: [`project_docs/api/p1-backend.md`](project_docs/api/p1-backend.md)

## Backend scripts (run in `apps/backend`)

```sh
pnpm exec medusa exec ./src/scripts/seed-defaults.ts                       # USD+EGP, region Egypt, Retail/Wholesale channels + publishable keys
pnpm exec medusa exec ./src/scripts/seed-categories.ts <categories.json>  # [{legacy_id,name,handle,parent_legacy_id}], idempotent by handle
pnpm exec medusa exec ./src/scripts/sync-search.ts                         # rebuild Meilisearch `products` index + settings
pnpm test:integration:http                                                 # needs Postgres (DB_* in .env.test, override via shell, e.g. DB_PORT=5442)
```

`REDIS_URL` set → Redis event bus, cache, workflow engine, locking; unset → Medusa in-memory (dev/tests only). `MEILI_HOST` unset → search sync off.

## Vendor CSV import

`POST /vendors/products/import`, multipart field `file`. Header row required, UTF-8, ≤1000 rows, ≤5 MB:

```csv
handle,title,description,category_handle,price_usd,compare_at_usd,unit,min_qty,qty_step,hs_code,b2b_only,image_urls
steel-pipe-4in,Steel pipe 4in,Seamless,iron-steel,120,150,ton,2,1,7304,true,https://cdn.example.com/a.jpg|https://cdn.example.com/b.jpg
```

| Column | Required | Format |
|---|---|---|
| handle | no | lowercase-kebab, globally unique; default = slug(title) |
| title | yes | text |
| description | no | text |
| category_handle | no | existing category handle |
| price_usd | yes | number ≥ 0 |
| compare_at_usd | no | number ≥ 0 (kept in `metadata.compare_at_usd`) |
| unit | no | text (ton, m2, piece…) |
| min_qty, qty_step | no | positive integer |
| hs_code | no | text |
| b2b_only | no | true/false/1/0/yes/no |
| image_urls | no | `\|`-separated URLs, first = thumbnail |

Response: `{ created: [{row,id,handle}], errors: [{row,handle,errors[]}] }`, `row` = CSV line (header = 1). Bad rows never block good ones.

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` (all via turbo).

Regenerate the UI theme after editing tokens: `pnpm --filter @icommerce/ui gen:theme`.
New migration after changing the vendor model: `pnpm --filter @icommerce/backend exec medusa db:generate vendor`.
