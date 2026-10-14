# iCommerce: handoff for Claude Code CLI

Status as of **2026-10-14**. Read this first, then the docs it points to. Everything here was true at commit `f6d288c` on `main`.

## 1. What this is

A multi-vendor **B2B + B2C marketplace** for Egyptian manufacturers. It rebuilds the old WordPress/WCFM site gosoor.com.eg (offline since 2022), now branded **iCommerce**. English and Arabic (RTL). Prices in USD.

| Doc | Read it for |
|---|---|
| `PRODUCT.md` | Users, brand, design principles, accessibility target (WCAG 2.2 AA) |
| `project_docs/00-old-site-overview.md` | How the old site worked, lessons learned |
| `project_docs/01-wp-audit.md` | What was in the WP backup |
| `project_docs/02-architecture.md` | Modules, flows, and the **decisions log** (decisions 1–16, the source of truth for owner decisions) |
| `project_docs/03-roadmap.md` | Phases P0–P7 |
| `project_docs/api/p1-backend.md` … `p3-backend.md` | Exact API contracts (routes, auth, shapes, errors) |
| `design-system/README.md` | Tokens, components, motion rules |
| `design-screens/*.dc.html` | Approved screen comps (Home, Product, Cart, Vendor, Arabic home) |

## 2. Repo map

```
apps/backend      Medusa 2.21.2: modules vendor, product-extra, company, quote, offline-payment, email;
                  admin routes (companies, invoices, rfqs, vendors); scripts; integration tests
apps/storefront   Next 16.4 (App Router), next-intl /en /ar, buyer + B2B flows
apps/vendor       Next 16.4 vendor portal (products, orders, quotes, shipping, settings, KYC)
packages/ui       Shared React components + theme generated from design-system/tokens.json
packages/sdk      Configured @medusajs/js-sdk
packages/config   tsconfig + eslint
tools/migrate-wp  Stage 1 extractor (WP dump → JSON). Stage 2 importer = apps/backend/src/scripts/import-wp.ts
design-system/    Local copy of the Claude Design system (tokens, previews, bundle.css/js)
design-screens/   Claude Design screen sources
```

## 3. Progress

| Phase | State |
|---|---|
| P0 Foundations | ✅ merged |
| P1 Vendors + catalog + WP migration | ✅ merged |
| P2 B2C (cart, checkout, order split, shipping, COD, bank transfer, emails, accounts) | ✅ merged |
| P3 B2B (companies, KYC, wholesale tiers, RFQ/quotes, approvals, net terms, platform-routed RFQs) | ✅ merged |
| **P4 Money** (platform fee, commission, payout ledger, vendor plans) | 🟡 **on branch, not merged** (see §4) |
| P5 Chat + reports + sales org | ⬜ |
| P6 ERP (Business Central + Odoo) | ⬜ |
| P7 Hardening + launch | ⬜ |

## 4. Resume here: finish P4

Branch `worktree-agent-aeba1892c972e16f0`, worktree `.claude/worktrees/agent-aeba1892c972e16f0`. Seven commits ahead of main:

```
e98c308 docs: p4 money backend contract              (project_docs/api/p4-backend.md)
a27bc5d feat(backend): p4 fee, commission, ledger, plans
06b323d feat(backend): p4 admin screens + money tests
4ed076c feat(vendor): payouts + plan pages, plan banner
51c6d5e merge main
7f9b03d fix(backend): p4 checks skip vendorless rfq lines
33f9e76 feat(storefront): platform fee line in cart to quotes
```

The agent was cut off with **4 uncommitted files** in that worktree: `apps/storefront/messages/{en,ar}.json`, `apps/storefront/src/components/FeeRow.tsx` (it was making the tier text show only when `min_amount > 0`), and `apps/vendor/src/app/[locale]/dashboard/payouts/page.tsx`.

To finish:
1. `cd .claude/worktrees/agent-aeba1892c972e16f0`. Review and commit those 4 files.
2. `git merge main`. Main has the P3 follow-ups: quote `vendor_id` is nullable, statuses `routing`/`routed`, `countOf` counts lines, `bidi()` money helper.
3. Run the full verification (§7), including the P4 exact-cents matrix test and Playwright on storefront fee lines plus vendor payouts and plan pages (EN/AR).
4. Merge into `main` with `--no-ff`, re-verify on main, push.

P4 defaults (owner may change; all editable in admin):

| Setting | Default |
|---|---|
| B2B buyer fee | ≥0 → 6%, ≥10k → 6%, ≥20k → 5%, ≥30k → 4%, ≥40k → 3%, by monthly volume, min USD 250, max USD 6,000 |
| B2C buyer fee | 2% of order total |
| Vendor commission | Global 10% |
| `PAYOUT_HOLD_DAYS` | 7 |
| `PLAN_GRACE_DAYS` | 7 |
| Plans | Starter free (50 products, no B2B) · Business USD 49/mo (1,000, B2B) · Enterprise USD 199/mo (unlimited, B2B, 5 featured) |
| Plan on arrival | Imported approved vendors → Business trial 60 days; new vendors → Starter |

Fee rules: the fee stays on the parent order only and is excluded from vendor payouts. With COD, the vendor collects the fee share and owes it back through the ledger.

## 5. Next phases (from the roadmap)

- **P5:** TalkJS buyer↔vendor chat (product, order, quote), vendor and platform reports (rollups, CSV), sales org (branches, account managers, brokers; attribution on orders). WP stage-1 already extracted `sales_org.json`.
- **P6:** ERP outbox → BullMQ worker → `BusinessCentralAdapter` (API v2.0, Entra ID OAuth2) + `OdooAdapter` (JSON-RPC); admin "ERP Sync" screen. Needs owner credentials and sandbox access.
- **P7:** security review, performance, SEO, final WP import, deploy, vendor re-onboarding.

## 6. Local environment (this machine)

**Quirks (important):**
- **Ports 5432 and 6379 are taken** by other projects. iCommerce uses Postgres **5442**, Redis **6389**, Meilisearch **7700**. Containers: `icommerce-postgres-1`, `icommerce-redis-1`, `icommerce-meilisearch-1` → `docker start icommerce-postgres-1 icommerce-redis-1 icommerce-meilisearch-1`.
- **`docker compose` plugin is broken** (dangling symlink). Fix it with `sudo apt install docker-compose-plugin`, or use `docker start`/`docker run`.
- **registry.npmjs.org times out.** Install with:
  ```bash
  pnpm install --frozen-lockfile --registry=https://registry.yarnpkg.com
  ```
  When adding a dependency: `pnpm install --lockfile-only --registry=https://registry.yarnpkg.com`, then strip any `tarball: https://registry.npmjs.org/...` entries from `pnpm-lock.yaml`. The lockfile must contain 0 npmjs tarball URLs and 0 localhost URLs.
- **Playwright** is borrowed from another project: `require('/home/gouda/iTourTMS/node_modules/@playwright/test')`. Browsers are in `~/.cache/ms-playwright`.

**Env files** (all gitignored; copy from `.env.example`): `apps/backend/.env` (DATABASE_URL on 5442, REDIS_URL `redis://localhost:6389/<db>`, MEILI_HOST/MEILI_INDEX, CORS, JWT/COOKIE secrets, optional `RESEND_API_KEY`, `BANK_TRANSFER_DETAILS`, `STOREFRONT_URL`), `apps/storefront/.env.local` (backend URL, "Storefront" publishable key, `RETAIL_SALES_CHANNEL_ID`, `WHOLESALE_SALES_CHANNEL_ID`, Meili search-only key), `apps/vendor/.env.local`.

**Fresh dev DB:**
```bash
cd apps/backend && npx medusa db:migrate
npx medusa exec ./src/scripts/seed-defaults.ts      # region Egypt, channels, Storefront key, providers, fee tiers…
npx medusa exec ./src/scripts/backfill-vendor-shipping.ts
npx medusa exec ./src/scripts/seed-demo.ts          # demo vendors/products + demo company (local test data only)
npx medusa exec ./src/scripts/sync-search.ts
```
Demo company logins (local only): `demo-buyer-admin@icommerce.test` / `demo-approver@icommerce.test`, password `DemoPass1!`.

**Real WP import** (stage 1 output already exists, gitignored):
```bash
npx medusa exec ./src/scripts/import-wp.ts /home/gouda/iCommerce/.claude/worktrees/agent-ae11c7cbe74734019/tools/migrate-wp/out
```
Idempotent: about 3 minutes full, 37 s re-run. It uploads about 1.6 GB of images into `apps/backend/static` (gitignored). Keep that worktree (`agent-ae11c7cbe74734019`): its `out/` folder is the extracted data. Re-running stage 1 needs the temp MySQL container `wp-migrate-db` (port 3317) and `WP_UPLOADS="…/uploads,…/Old WP Project/recovered-uploads"`.

## 7. Verify before every merge/push

```bash
pnpm -s turbo run typecheck lint build --force        # expect 15/15
cd apps/backend && DB_PORT=5442 pnpm test:integration:http   # 19/19 at f6d288c (+ P4 tests)
```
Plus Playwright end-to-end tests on the built apps for UI changes, English and Arabic, 390px.

Before pushing, check that nothing sensitive is tracked:
```bash
git log origin/main..main --name-only --pretty=format: | sort -u | grep -Ei '(^|/)\.env($|\.local)|\.sql$|Old WP|migrate-wp/out/|static/|\.emails/|uploads/private'
```
This must print nothing.

## 8. Rules (owner's standing instructions)

- **Never commit `Old WP Project/`**: it holds DB credentials and customer PII. It is gitignored. Never read or copy `wp-config.php`. `tools/migrate-wp/out/` contains PII and is also gitignored.
- Style: YAGNI, minimal code, mark deliberate shortcuts with `// ponytail:` comments; terse replies.
- Every UI string in EN and AR; RTL correct; WCAG 2.2 AA; logical CSS properties; money inside sentences via `bidi()`/`<bdi>`.
- Commits: Conventional Commits, subject ≤ 50 chars, ending with the `Co-Authored-By` trailer. Commit as `Mohamed Gouda <mggouda@gmail.com>`.
- **Push to `origin/main` after each verified merge** (owner-authorized). Remote: https://github.com/mg-gouda/iCommerce. The repo is **public**.
- Design: the login screen is a compact glass card on a black abstract backdrop (blur 10px), the only glass in the system. There are three signature animations (AddToCart, Checkout, Ship) in `packages/ui` and nowhere else.
- Work pattern so far: one agent per phase slice in a git worktree; the contract doc is committed first; the orchestrator reviews (security: scoping, isolation tests), merges, re-verifies and pushes. Resume interrupted agents rather than restarting them.

## 9. Known issues / open items

- **Before staging:** the production backend build (`medusa start` from `.medusa/server`) doesn't show the custom admin pages (Companies, Invoices, Vendors, RFQs return 404), and the admin cookie fails over http unless `NODE_ENV=development`. Works under `medusa develop`.
- **GitHub Actions** can't run: the account is locked for a billing issue (owner removed the payment method; lock persisted). `.github/workflows/ci.yml` is ready. Run checks locally until it's fixed.
- **About 2,000 WP product photos are missing** (Jun–Sep 2022, after the June backup). They are recoverable only if the owner's HDD has `wp-content/uploads/2022/06`–`/09`.
- **Ponytails worth revisiting:**
  - In-memory rate limiter (move to Redis for multi-instance).
  - Refunds are manual.
  - Partial vendor cancel leaves the full payment authorized.
  - Vendor owner accounts from the WP import have no password (a reset-invite flow is needed).
  - Fractional-step products are quote-only (cart quantity is an integer); orders do support decimals.
  - Search tiles have no MOQ.
  - The RFQ draft is kept in a cookie (about 30 lines max).
- **Claude Design:** design system https://claude.ai/artifact/XhqsUUUEUZvQVUhpGmX4ht, screens https://claude.ai/artifact/ChLN61rdKjYArnrCvue9eZ. Both are private and mirrored in `design-system/` and `design-screens/`.
