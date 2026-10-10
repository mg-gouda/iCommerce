# CheckoutButton

The cart's proceed-to-checkout action: each cart thumbnail drops into the open box on the button (staggered 90ms, ~560ms each), the flaps close, tape seals, and the label reads "Order packed ✓" before routing to checkout.

- **Consumer provides:** button `ic-btn ic-btn--primary ic-btn--lg ic-mbtn` containing the `.ic-box` SVG and `.ic-mbtn__label` (with the total: "Checkout · USD 512.00"), and the cart line thumbnails. Call `iCommerce.checkout(btn, { items, onDone })`; navigate in `onDone` (fires ~500ms after sealing). Start prefetching the checkout route on click so the animation hides load time.
- **Many items:** animate at most 5 thumbnails; the rest are implied (total time stays under 1.2s).
- **Reduced motion:** no drops; flaps close instantly; label swaps; route immediately.
- **Don't:** reuse for "Place order" (payment confirmation needs a plain, unambiguous state, not a playful one).
