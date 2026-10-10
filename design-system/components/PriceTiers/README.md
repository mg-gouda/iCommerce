# PriceTiers

The wholesale quantity-break table on B2B product pages and quote offers.

- **Consumer provides:** ordered tiers (`min`, `max`, unit price, unit name) and the buyer's current quantity; mark the matching row `aria-current="true"` (brand-tint fill + dot + bold).
- **Content:** column heads name the unit ("Quantity (sets)", "Price / set"); ranges use en dash and thousands separators; prices right-aligned (`text-align: end`), tabular figures.
- **Below it:** live subtotal for the entered quantity and a note that the platform fee appears at checkout (fees are a separate line, never folded into tier prices).
- **Don't:** hide tiers behind a hover; B2B buyers compare them side by side.
