# P5b Chat API (TalkJS)

Conventions follow [p5-backend](p5-backend.md). TalkJS is the chat UI and storage. Our backend owns **who may talk to whom**: it creates every conversation over the TalkJS REST API and signs every session token. The browser never creates conversations.

## 0. Setup
| Env | Where | Meaning |
|---|---|---|
| `TALKJS_APP_ID` | backend | test or live app id |
| `TALKJS_SECRET_KEY` | backend | `sk_test_…` / `sk_live_…`. Server only, never sent to a client |
| `TALKJS_API_URL` | backend | default `https://api.talkjs.com`; tests point it to a local stub |
| `NEXT_PUBLIC_TALKJS_APP_ID` | storefront, vendor | same app id |

If the app id or secret is unset, chat routes return **503 `{ type: "chat_disabled" }`** and every chat UI entry point is hidden. The app keeps working.

Owner/ops, before go-live, in the TalkJS dashboard:
1. Enable **Authentication (identity verification)**.
2. **Disallow user + conversation synchronization via the browser**.
3. Set role `default` email notifications on, and default locale per user (we set `locale`).

## 1. Identities (TalkJS user ids)
| Who | TalkJS id | name | email | role | locale |
|---|---|---|---|---|---|
| Buyer (customer) | `c_<customer_id>` | full name, else email | customer email | `buyer` | customer metadata locale, else `en` |
| Vendor (one shared inbox per vendor) | `v_<vendor_id>` | vendor name | vendor contact email | `vendor` | `en` |
| Platform (disputes) | `ops` | "iCommerce Support" | `ADMIN_NOTIFY_EMAIL` | `ops` | `en` |

Users are upserted via `PUT /v1/{appId}/users/{id}` before each session or conversation create. The call is cheap and idempotent. All users of one vendor share `v_<vendor_id>`, which keeps v1 simple. `// ponytail:` per-user vendor identities come later, if needed.

**Session token**: a JWT signed with HS256 using the secret, carrying `{ tokenType: "user", iss: appId, sub: <talkjs id>, exp: now + 1h }`. Clients refetch it when it expires.

## 2. Conversations (deterministic ids, created server-side only)
| Kind | id | Participants | Who may open it | subject |
|---|---|---|---|---|
| product | `prd_<product_id>_<customer_id>` | buyer + product's vendor | any signed-in buyer, for a **published** product with a vendor | product title |
| order | `ord_<child_order_id>` | parent order's customer + child's vendor | that buyer or that vendor | `Order #<parent display_id>` |
| quote | `qt_<quote_id>` | quote's requester + quote's vendor | requester, any member of the requester's company with role admin/approver, or the vendor | `Quote <rfq ref>` |

The conversation is upserted (`PUT /v1/{appId}/conversations/{id}`) with:
- `participants`
- `subject`
- `custom: { kind, ref_id, vendor_id, customer_id }`
- `photoUrl` (product thumbnail, if any)

Company members other than the requester are added as participants on first open (quote kind only). Vendor-less RFQ lines (platform-routed) have no quote chat until routed.

## 3. Routes
| Method | Path | Auth | Body / query | Response |
|---|---|---|---|---|
| GET | `/store/chat/session` | customer | `lang?` | `{ app_id, user_id, token }` |
| POST | `/store/chat/conversations` | customer | `{ kind: "product"\|"order"\|"quote", ref_id, lang? }` | `{ app_id, user_id, token, conversation_id }` |
| GET | `/store/chat/unread` | customer | – | `{ count }` (account-nav badge) |
| GET | `/vendors/chat/session` | vendor | `lang?` | same as store |
| POST | `/vendors/chat/conversations` | vendor | `{ kind: "order"\|"quote", ref_id, lang? }` (vendors can't start product chats → 400) | same |
| GET | `/vendors/chat/unread` | vendor | – | `{ count }`: unread conversations for `v_<vendor_id>` via REST; also fills `kpis.unread_chats` in `/vendors/reports/summary` once P5a lands |
| GET | `/admin/chat/conversations` | admin | `kind`, `vendor_id`, `customer_id`, `limit`, `offset` | list from TalkJS REST (`custom` filter), newest first |
| GET | `/admin/chat/conversations/:id/messages` | admin | `limit`, `startingAfter` | read-only messages (disputes) |
| POST | `/admin/chat/conversations/:id/join` | admin | – | adds `ops` as participant + returns an ops session `{ app_id, user_id, token }` |

`lang` (`en`|`ar`, optional) = the page locale; it is written to the **caller's** TalkJS user `locale`, which is what drives the TalkJS UI language and RTL (TalkJS has no per-session locale). Omitted → the profile locale of §1. The other party is upserted without `locale`, so theirs is kept. It is named `lang` because Medusa strips `?locale=` from `req.query` (its translation middleware).

Errors:
- `ref_id` not found, or the caller isn't allowed to open it → **404** (never reveal existence).
- TalkJS errors → **502 `{ type: "chat_upstream" }`**.
- Guests: chat requires sign-in (401).

## 4. UI
- **Storefront**:
  - **"Message supplier"** on the product page (signed-out → login with `next`)
  - **"Message vendor"** on each vendor block of order detail and quote detail
  - **Messages** page (`/account/messages`): TalkJS Inbox
  - unread badge on the account-area **Messages** link, rendered server-side from `GET /store/chat/unread` (the header renders on every page, and loading the SDK there would break "SDK only on chat surfaces")
- **Vendor portal**:
  - **Messages** page (Inbox), with an unread badge in the nav (server-side, `GET /vendors/chat/unread`)
  - **"Message buyer"** on order detail and quote detail
- **Admin**: a "Conversations" page with filters and a read-only transcript, plus "Join as support". `// ponytail:` the admin has no TalkJS UI; after joining, `ops` replies by email notification or from the TalkJS dashboard.
- **Shared**: load the TalkJS SDK (`talkjs` npm or `@talkjs/react`, one dep) only on chat surfaces. Locale = page locale (`ar` → RTL). Chat failing to load shows an inline error with retry, never a blank box.

## 5. Tests (`p5b-chat.spec.ts`, TalkJS stubbed via `TALKJS_API_URL`)
- **Access matrix**:
  - a buyer can open product chat (published product only), and own order and quote chats; another buyer's → 404
  - a vendor can open only own order and quote chats; another vendor's → 404; product kind → 400
  - a company approver can open a member's quote chat; a non-member can't
- **Token**: valid HS256 with the right `sub`/`iss` and `exp` ≈ 1 h; the secret never appears in any response.
- **Upserts**: user and conversation payloads sent to the stub match §1–2 (participants, subject, custom).
- Keys unset → 503 `chat_disabled`.
- Admin list, messages and join are admin only (401 for vendor/customer).
