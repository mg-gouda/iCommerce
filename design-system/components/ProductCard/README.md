# ProductCard

The catalog tile for search, category and vendor-store grids; one component, two modes (B2C retail, B2B wholesale).

- **Consumer provides:** image (4:3, `object-fit: cover`), vendor name (+ `ic-badge--verified` shield when KYC-verified), title (2-line clamp), price, up to 2 facts, one CTA.
- **B2C mode:** single price (sale: `ic-card__price--sale` + struck original), delivery estimate, primary "Add to cart".
- **B2B mode:** price range across tiers with unit ("USD 9.80–12.40 / set"), facts MOQ + lead time, `ic-badge--b2b` on image, secondary "Request quote". Guests see "Sign in for wholesale prices" instead of the range.
- **Grid:** `repeat(auto-fill, minmax(200px, 1fr))`, `space-6` gap desktop, `space-4` phones (2 columns at 400px with minmax 160px).
- **States:** hover adds `shadow-1` + `line-strong` edge; whole card focusable via the title link (`:focus-within` ring); skeleton = media block + 3 bars in `ground`.
- **RTL:** wrap prices in `<bdi>` so "USD 152.00" never reorders; Arabic-Indic digits allowed in copy, prices stay Latin digits.
