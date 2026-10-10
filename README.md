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
- Vendors spike: `GET /admin/vendors` (admin auth required)

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` (all via turbo).

Regenerate the UI theme after editing tokens: `pnpm --filter @icommerce/ui gen:theme`.
New migration after changing the vendor model: `pnpm --filter @icommerce/backend exec medusa db:generate vendor`.
