# AddToCartButton

Primary add-to-cart action with flight feedback: a copy of the product photo arcs from the tile into the header cart (700ms), the cart bumps, its count increments, and the button reads "Added ✓" for 1.6s.

- **Consumer provides:** the button (`ic-btn ic-btn--primary ic-mbtn`, label inside `.ic-mbtn__label`), the product `<img>`, the header cart element (`.ic-cart`) and its count (`.ic-cart__count`). Call `iCommerce.addToCart(btn, { image, cart, count, qty })` after (or while) the cart API call runs: the item is added optimistically, the animation is feedback only.
- **Failure:** if the API rejects, decrement the count and show the error under the button ("Couldn't add. Out of stock at this quantity."); no reverse flight.
- **Never blocks:** a second click during flight is ignored; the rest of the page stays usable.
- **Reduced motion:** no flight; cart count fades in place and the label swaps.
- **RTL:** flight targets the cart wherever it is (inline-end in Arabic); positions come from the live layout.
- React (`packages/ui`): same timing via WAAPI in a `useAddToCartFlight()` hook.
