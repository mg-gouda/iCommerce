# Product

## Register

product

## Users
- **Company buyers (B2B)**: procurement/import managers sourcing Egyptian manufactured goods (furniture, plastics, carpets, aluminum, electrical, garments…). Job: find verified suppliers, compare, request quotes (RFQ), order at MOQ, pay upfront or on net terms. Desktop-heavy, office hours, comparing many tabs.
- **Retail buyers (B2C)**: consumers in Egypt/region buying single items. Job: search, trust the seller, check out fast. Mobile-heavy, EN or AR.
- **Vendors**: Egyptian manufacturers/wholesalers (≈1.2k migrating). Job: list products (often in bulk), answer buyer questions, respond to RFQs, ship orders, watch sales and payouts. Often non-technical staff, desktop + phone.
- **Platform staff**: ops, branch/account managers, brokers, finance. Job: approve vendors/companies, set fees/commission/plans, monitor ERP sync, resolve disputes.

## Product Purpose
iCommerce is a multi-vendor marketplace for B2B export trade and B2C retail from one catalog. It exists so Egyptian suppliers reach both wholesale and retail buyers with verified trust, transparent pricing and quoting, and platform-run payments, fees and ERP bookkeeping. Success = buyers actually transact (the WP predecessor had 1.2k vendors but almost no buyers), RFQ→order conversion, vendor activity, repeat company orders.

## Brand Personality
**Trusted, global, efficient.** Heritage tagline: "Bridging the Globe". Voice: clear, factual, trade-literate (MOQ, HS code, lead time, Incoterms), never hype. Emotional goal: a buyer feels "this supplier is real and this deal is safe"; a vendor feels "this is easier than my spreadsheet".

References: **Alibaba / Made-in-China** (supplier verification, RFQ, MOQ visible on cards), **Amazon / Noon** (search-first, dense listings, fast checkout), **Faire** (clean wholesale presentation, brand-respectful product imagery).

## Anti-references
- Temu/AliExpress-style urgency: countdown timers, flashing badges, red-everywhere discount noise.
- Generic SaaS template look: purple gradients, hero-metric tiles, identical icon-card grids.
- WordPress Martfury theme clutter (the predecessor): sliders, mega-banners, crowded sidebars.
- Decorative glassmorphism across the app (exception: the login form, per owner's standing preference).

## Design Principles
1. **Trust is visible**: verification status, company KYC, vendor tenure, response time shown where decisions are made, not buried.
2. **Dense but calm**: show trade facts (price tiers, MOQ, unit, lead time, origin) at a glance with strong hierarchy instead of decoration.
3. **One catalog, two modes**: B2B and B2C share components; mode changes prices, MOQ, and calls to action, not the whole UI.
4. **Bilingual by construction**: every layout works mirrored (RTL) and with Arabic text length from day one.
5. **Vendors are users too**: the vendor portal gets the same craft as the storefront; bulk work (import, edit, reply) is first-class.

## Accessibility & Inclusion
- WCAG 2.2 AA: text contrast ≥4.5:1, UI ≥3:1, full keyboard paths (checkout, RFQ, vendor tables), visible focus, screen-reader labels.
- RTL (Arabic) parity, logical CSS properties, mirrored icons where directional.
- `prefers-reduced-motion` respected; no motion carries meaning alone.
- Color never sole signal for status (verified, stock, order state use icon + text).
- Low-bandwidth friendly: image-light defaults, skeletons, fast mobile on 3G/4G.
