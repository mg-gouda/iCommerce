# 01 — WP Audit: gosoor.com.eg/marketplace

Source: `Old WP Project/marketplace` + `gosoor_wp_xlqxx.sql` (dump 2022-09-07, MySQL 5.7, PHP 7.4, WP ~6.0).
Read-only audit. Nothing executed/imported.

## TL;DR
- **What it really is:** B2B **export/wholesale marketplace** for Egyptian manufacturers. Categories follow HS-code chapters (furniture, plastics, carpets, aluminum, electrical…). Buyer → **request quote** → vendor ("wholesaler") accepts/rejects → platform adds **intermediation fee**.
- **Supply side built, demand side never took off:** 1,181 vendors, ~16.5k products, but **9 customers, 2 orders (both expired quotes)**.
- **Migrate:** vendors, products, categories, attributes, media, vendor↔buyer messages. **Don't migrate:** orders, analytics, plugin junk.
- **Custom logic to keep:** fee matrix, quote workflow statuses, sales hierarchy (branch→manager→account mgr/broker), wholesaler KYC fields, ERP sync.
- B2C was never really used in WP, but **B2C is a v1 target** in the new build (confirmed). B2B + B2C both v1.

## Size
| Item | Size | Keep? |
|---|---|---|
| `wp-content/ai1wm-backups` | 12 GB | ❌ old .wpress of same site |
| `wp-content/uploads` | 2.3 GB, 47.6k files (26.3k attachments + WP resized thumbs) | ✅ originals only |
| `wp-content/cache` | 1.6 GB | ❌ |
| `wp-content/plugins` | 478 MB | ❌ (reference only) |
| SQL dump | 337 MB, 134 tables | ✅ source for migration |

## Data inventory
| Entity | Count | Source | Migrate |
|---|---|---|---|
| Vendors (`wcfm_vendor`) | 1,181 | `users` + `usermeta` (store profile in WCFM meta) | ✅ |
| Other staff roles | ~60 (admin, shop_manager, operations_logistics, service_providers_vendor, ceo, it_super_admin…) | `usermeta.capabilities` | ✅ as admin users/roles (review list) |
| Customers | 9 (+14 subscribers) | `users` | ✅ (trivial) |
| Products published | 16,505 (+428 pending, 38 draft, 82 trash) | `posts` + `postmeta` | ✅ publish+pending |
| Variations | 19 | `posts` | ✅ (almost all simple products) |
| Product categories | 97 (HS-chapter style, 2-level) | `term_taxonomy` | ✅ clean up names/HTML entities |
| Product tags | 2,579 | | ⚠️ dedupe or drop |
| Attributes | `pa_unit` 74, `pa_color` 45, `pa_size` 20 | | ✅ |
| Media attachments | 26,328 | `posts` + `uploads/20xx` | ✅ originals → R2 |
| Vendor↔buyer messages | 2,493 (`wcfm_messages`) | | ⚠️ optional, likely low value |
| Vendor ledger / withdrawals | 135 / few | | ❌ (no real sales) |
| Orders | 2 (expired quotes) | | ❌ |
| WCFM analytics | 1.08M rows (`wcfm_detailed/daily_analysis`) | page-view logs | ❌ |
| Membership subscriptions | 5 | `wcfm_membership_subscription` | ⚠️ check if vendor plans were sold |

Top categories by product count: Furniture & Home Textiles 1771 · Plastics 1664 · Carpets 1307 · Aluminum 1184 · Electrical Machinery 1165 · Iron/Steel 822+567 · Garments 635+374 · Medical/Optical 424 · Home Appliances 412 · Perfumes/Cosmetics 398.

## Plugin stack → what each did → replacement
| Plugin | Function | New platform |
|---|---|---|
| WooCommerce | core commerce | Medusa core |
| **WCFM** (marketplace, ultimate, membership, product hub) | multi-vendor, vendor dashboard, store pages, messages, vendor membership plans, withdrawals | Vendor module + Next.js vendor dashboard |
| **YITH Request a Quote Premium** | B2B RFQ flow | Custom `quote` module (Medusa B2B starter has quotes) |
| woocommerce-min-max-quantities | MOQ | product field `min_qty`/`max_qty`/`step` |
| woocommerce-unit-of-measure | sell per unit (ton/m²/piece…) | product field `unit` |
| woocommerce-name-your-price | buyer proposes price | covered by RFQ (drop) |
| woocommerce-cost-of-goods | margin reporting | `cost_price` field + reports |
| woocommerce-order-status-manager | custom statuses (quote flow) | quote state machine |
| woocommerce-pdf-invoice | invoices | PDF gen (react-pdf) |
| woocommerce-currency-converter-widget | display currencies (base USD) | Medusa multi-currency (USD + EGP) |
| woocommerce-deals, dashboard-stats, sales-by-country | promos / stats | Medusa promotions + vendor reports |
| variation-swatches, yith-compare, yith-wishlist | storefront UX | storefront features |
| mailchimp-for-woo/wp | marketing | Mailchimp/Resend integration (later) |
| ACF Pro, Meta Box, Admin Columns, Admin Menu Editor, WP Sheet Editor | admin plumbing | ❌ not needed |
| Martfury theme + WPBakery + RevSlider + Kirki | storefront theme | Next.js storefront |
| Contact Form 7, WPForms, Forminator | forms | 1 contact/lead form |
| WP Rocket, Wordfence, Site Kit, Sitemap, Loco Translate, WP Mail SMTP | ops | Next.js ISR/CDN, Sentry, next-sitemap, next-intl, Resend |

## Custom code (≈2.5k PHP LOC) — business rules to carry over
### 1. `gossor-erp` — intermediation fees + ERP sync
- Table `intermediation_fees`: matrix `(orders, amount) → fee %, minFees, maxFees`. Current data:

  | order count | monthly amount (USD) | fee % | min | max |
  |---|---|---|---|---|
  | 1 | 10,000 | 6 | 250 | 6,000 |
  | 1 | 20,000 | 5 | 250 | 6,000 |
  | 1 | 30,000 | 4 | 250 | 6,000 |
  | 1 | 40,000 | 3 | 250 | 6,000 |

- Calc: buyer's **current-month** processing orders total + this order → nearest amount tier → fee % of order, clamped to min/max → added as order fee line + note. Triggered **manually** by admin button "Calculate Gosoor Fees".
- **Bugs:** "nearest" tier (not floor) → $14k picks 10k tier, $16k picks 20k tier; order-count match uses `orders + all_total` (mixes count and money). Rewrite as proper **floor-tier lookup**, auto-applied at quote acceptance.
- Table `erp_request`: per order, sync flags for `customer`, `item`, `vendor`, `salesQt` (sales quotation) → external ERP pulled orders. 34 rows. **Answer: Odoo + Dynamics 365** → both need connectors in new build.
- Order admin: "View Product" / "View Vendor" buttons. `venderproductlink` product meta (vendor's external product URL).

### 2. `gosoor-branch` + child theme — sales hierarchy (CRM)
- Tables `Branch_Name` (7), `Branch_Account_Manager_top` (branch managers, 7), `Branch_Account_Manager` (account managers), `Intro_Broker` (introducing brokers).
- Each user (buyer/vendor) assigned: branch → branch manager → **either** account manager **or** introducing broker.
- Two overlapping impls (child theme uses ACF `sales_branches` CPT, plugin uses raw tables). Pick one → `sales_branch`, `sales_rep` (type: manager | account_manager | broker), `user.assigned_rep_id`.
- Implies **broker commission** / rep attribution in reports. **Q: were brokers paid commission?**

### 3. `wholesaler-custom-fields` — B2B KYC
- User fields: **Tax ID**, **Commercial Registration No.**, **Export Card No.** → vendor + company-buyer verification fields (+ document uploads in new build).

### 4. Quote workflow (YITH + order-status-manager)
```
New Quotation Request → Submitted for Wholesaler Acceptance → Wholesaler Accepted | Wholesaler Rejected | Expired
                                                          → (accepted) → Pending payment → Processing → Completed
```
→ becomes core `quote` state machine in new build.

## Security / quality notes (WP version)
- SQL injection: `gosoor-branch` concatenates `$_POST`/meta into SQL (`WHERE Branch_ID = $branch_id`), `metabox-p1.php` dumps `last_query` to screen.
- Debug output and `var_dump` left in admin code.
- `wp-config.php` contains DB creds + salts → **rotate if that server is still alive**; never commit `Old WP Project/` to git.
- Dump contains PII (users, emails, phones, tax IDs) → keep out of git, add `Old WP Project/` to `.gitignore`.

## Implications for the new platform
1. **B2B + B2C both v1**: RFQ/quote + MOQ + unit of measure + KYC core for B2B; retail cart/checkout core for B2C.
2. **Commerce engine:** nothing exotic → **Medusa v2 fits** (B2B starter covers companies + quotes). Stack decision from `stack` discussion stands.
3. **Platform revenue = buyer-side intermediation fee** (tiered by monthly volume), plus possibly vendor membership plans (WCFM membership) → both need modelling.
4. **Sales org (branches/reps/brokers)** = small internal CRM module → attribution on users and orders.
5. **Currency:** base USD (export pricing), EGP display/settlement. Country EG.
6. **i18n:** content ~100% English (30 Arabic product titles), theme had RTL → EN + AR from day 1.
7. **Migration scope small and clean:** ~1.2k vendors, ~17k products, ~26k images. One script, idempotent, rerunnable.

## Open questions
1. Is the WP site still live? Any data newer than Sep 2022 dump?
2. ~~ERP~~ → Odoo + Dynamics 365.
3. Brokers/account managers: paid commission? Need reports per rep?
4. Vendor membership plans: paid? keep as revenue model?
5. Keep 2,493 old messages, or start fresh?
6. ~~B2C~~ → yes, v1 target.
