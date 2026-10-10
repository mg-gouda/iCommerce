# LoginCard

The sign-in screen for storefront, vendor portal and admin: a compact glass card (max 320px wide) on a black abstract backdrop blurred 10px.

- **Consumer provides:** the form fields (email or phone, password), primary "Sign in", links to reset and sign-up; for the vendor portal, sub-line "Sign in to manage your store."
- **Backdrop:** `glass-ground` black with large soft shapes in `navy`, `brand` and `brand-ink` plus three hairline trade-route curves; the art layer carries `filter: blur(10px)`. Shapes only; no photos.
- **Card:** `glass-fill`, `glass-line` edge, `radius-lg`, `backdrop-filter: blur(18px)`, `shadow-glass`; text `glass-ink`, labels `glass-ink-muted`. Inputs 36px (compact).
- **This is the only glass surface in iCommerce.** Every other panel is solid `surface`.
- **Same in both themes:** the login screen is always dark.
- **Errors:** inline under the field ("Wrong password. Try again or reset it."), never a toast.
