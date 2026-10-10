# ShipButton

The vendor's "Mark as shipped" action on an order: a delivery truck drives across the button in reading direction (left → right in English, mirrored right → left in Arabic) over a moving road line (1.3s), then the button turns `success` with "Shipped ✓".

- **Consumer provides:** button `ic-btn ic-btn--primary ic-mbtn ic-ship` containing the `.ic-truck` SVG, an empty `.ic-road` span and `.ic-mbtn__label`. Call `iCommerce.ship(btn, { onDone })` once tracking details are saved (the button sits after the carrier + tracking fields). Done state is final; undo lives in the order's menu, not on this button.
- **Width:** at least 170px so the truck has a visible run.
- **Reduced motion:** no truck; label swaps straight to "Shipped ✓".
- **Also used** on the buyer side as a read-only "Shipped" status animation in order tracking (same SVG, no click).
