iCommerce is a multi-vendor marketplace for B2B export trade and B2C retail from one catalog: Egyptian manufacturers selling to company buyers worldwide and to retail shoppers. The system carries the Gosoor palette (blue `brand`, navy `navy`, red `accent`) into a calm, dense product UI that reads as **trusted, global, efficient**.

## Content fundamentals

- **Voice:** clear, factual, trade-literate. Use the buyer's terms of art: MOQ, lead time, unit price, HS code, quotation, net 30. No hype, no exclamation marks, no emoji.
- **Person:** address the user as "you"; the platform is "iCommerce", never "we" in UI labels.
- **Casing:** sentence case everywhere ("Request a quote", "Verified supplier"). Codes stay as written (`HS 5702.10`, `Q-2026-00418`).
- **Numbers:** always with unit and currency: "USD 11.10 / set", "MOQ 200 sets", "Lead time 21 days". Thousands separators, two decimals for money, tabular figures (`ic-num`).
- **Actions:** verb labels that say what happens: "Add to cart", "Send offer", "Publish product", "Place order · USD 920.00".
- **Errors:** what went wrong + how to fix: "Tax ID has 9 digits, e.g. 512-483-907." Never "Something went wrong".
- **Arabic:** every string exists in EN and AR. Arabic copy is written, not machine-literal; keep trade codes and prices in Latin digits inside `<bdi>`.

## Visual foundations

### Color
- **Restrained strategy.** Neutrals carry ~90% of every screen: `ground` behind, `surface` for content, `ink` / `ink-muted` for text, `line` for hairlines.
- `brand` marks the primary action, current selection, active nav and the focus ring. One primary button per region.
- `navy` is structural: storefront top bar and footer, vendor-portal sidebar, the B2B mode band. Text on it in `on-navy` / `on-navy-muted`.
- `accent` red is promotional only: sale badges and sale prices on `surface`. Never buttons, never errors (errors use `danger`).
- Status colors (`success`, `warning`, `danger` + their `-tint` grounds) always come with an icon and a word.
- Links: `brand-ink` (passes 4.5:1 on `ground`, `surface` and `brand-tint`); plain `brand` text only at 16px+ on `surface`.
- Both themes are first-class. Dark is navy-based (`ground` #0f0e29), not grey.

### Type
- **IBM Plex Sans** for all UI with **IBM Plex Sans Arabic** for Arabic (same skeleton, same weights), **IBM Plex Mono** for codes and figures (`data`).
- Fixed scale, ratio ~1.2: `display` 30 · `title` 24 · `heading` 20 · `subheading` 16 · `body` 14 · `small` 13 · `caption` 12. No fluid type in the app.
- Arabic sets one step larger with taller leading (`ar-body` 15/26, `ar-title` 24/36).
- Weights: 400 text, 500 labels, 600 headings, prices and buttons. No 700+.

### Spacing & layout
- 4px base: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-6` 24 · `space-8` 32 · `space-12` 48.
- Gutters: `space-4` on phones, `space-8` desktop. Grids use `gap`, never per-item margins.
- Storefront: top bar (`navy`) → search-first header → content on `ground`. Vendor portal: `navy` sidebar + `ground` canvas + `surface` panels and tables.
- Logical CSS properties only (`margin-inline-start`, `inset-inline-end`), so RTL mirrors without overrides. Directional icons (arrows, chevrons) flip in RTL; brand shapes and charts do not.

### Shape, edges, elevation
- Radii: `radius-sm` 4 (badges), `radius-md` 6 (buttons, inputs), `radius-lg` 10 (product tiles, panels, login card), `radius-pill` counts and avatars only.
- Resting surfaces separate by a `line` edge, not shadow. `shadow-1` only on tile hover; `shadow-2` for menus and popovers.
- **Glass appears in exactly one place:** the login screen (`LoginCard`: compact card on a black abstract backdrop blurred 10px). Nowhere else.
- Focus: 2px solid `focus-ring` outline with 2px offset on every focusable element.

### Motion
- 150–200ms, ease-out (`cubic-bezier(.25,1,.5,1)`), for state changes only: hover, press, open/close, loading.
- No page-load choreography, no bounce. `prefers-reduced-motion` removes transforms and transitions.

### Imagery
- Real product photos on `ground` placeholders, 4:3 `object-fit: cover` in tiles. Vendors' own photos; no stock lifestyle shots.
- Skeletons in `ground` while loading, never spinners in content.

## Iconography

- **Lucide** (`lucide-react` in code): 24px grid, 2px stroke, round caps, `currentColor`. Sizes 16 (inline, badges 12), 20 (buttons, nav), 24 (empty states).
- Trust uses the shield-check glyph (`ic-badge--verified`); state badges use check, clock, alert-circle.
- No emoji, no filled or duotone icon mixes.

## Brand mark

No iCommerce logo exists yet: set the name in type as "i" in `ink` + "Commerce" in `brand`, IBM Plex Sans 600 (see `LoginCard`, cover). The old Gosoor mark is not used. Replace with a real mark when one is designed.

## Components

| Component | Use |
|---|---|
| `Button` | every action; primary / secondary / ghost / danger, 3 sizes |
| `Field` | labelled inputs with unit addon, help and error |
| `Badge` | trust (verified), channel (B2B), promo (sale), state |
| `ProductCard` | catalog tile, B2C and B2B modes, RTL |
| `PriceTiers` | B2B quantity-break table |
| `LoginCard` | sign-in screen for all three apps |

Class prefix `ic-`, stylesheet `components/bundle.css`. In the codebase these become React components in `packages/ui` (shadcn primitives restyled with these tokens).

## Intentional additions

This is a from-scratch system seeded from the Gosoor palette only (no prior component library), so it starts with the six commerce-critical components above. Next: data table (vendor orders), select/combobox, tabs, RFQ thread, cart line, checkout steps, empty states, toasts.
