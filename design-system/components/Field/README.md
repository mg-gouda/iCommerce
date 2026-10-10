# Field

A labelled text input with optional help, unit addon and error; the base for every form (checkout, RFQ, KYC, product editor).

- **Consumer provides:** `ic-field` wrapper, `<label class="ic-label" for>` (always visible, never placeholder-only), `<input class="ic-input" id>`, optional `ic-help` or `ic-error` linked by `aria-describedby`.
- **Units:** trade quantities always carry their unit via `ic-input-group` + `ic-addon` ("pieces", "m²", "tons", "USD"). Show MOQ and step in `ic-help`.
- **Codes:** Tax ID, CR No., Export Card No., HS code, SKU use `ic-mono`.
- **States:** hover, `:focus-visible` (`focus-ring`), `aria-invalid="true"` (`danger` border + `ic-error` with icon and a fix: "Tax ID has 9 digits, e.g. 512-483-907."), `disabled` (`ground` fill + help saying why).
- **RTL:** layout uses logical properties; numbers stay LTR inside Arabic forms (`dir="ltr"` on numeric inputs).
