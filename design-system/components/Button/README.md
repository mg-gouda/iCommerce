# Button

Use `ic-btn` for every clickable action; one `ic-btn--primary` per view region (the action that moves the buyer or vendor forward).

- **Consumer provides:** a `<button>` (or `<a>` for navigation) with a verb label: "Add to cart", "Request quote", "Send offer", "Publish product". Labels state what happens; never "Submit" or "OK".
- **Variants:** `ic-btn--primary` (brand fill: checkout, place order, send offer), default (secondary: request quote, filters, export), `ic-btn--ghost` (tertiary, inline: contact supplier, view all), `ic-btn--danger` (destructive: cancel order, delete product; confirm inline, not in a modal).
- **Sizes:** `ic-btn--sm` 30px (tables, toolbars), default 36px, `ic-btn--lg` 44px (checkout, mobile primary). `ic-btn--block` for full-width on phones.
- **States:** hover, `:focus-visible` (2px `focus-ring` outline, 2px offset), active (1px press), `disabled` (45% opacity, reason shown nearby, e.g. "Below MOQ"), `aria-busy="true"` (spinner, label kept for screen readers).
- **Do:** put the price in the checkout button ("Place order · USD 920.00"). **Don't:** use `accent` red for buttons; red is for sale badges only.
