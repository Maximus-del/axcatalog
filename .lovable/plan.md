## Affiliate Program

A standalone surface that lives next to the athlete portal but does not pollute it. Anyone can sign up, request products to promote, share a unique discount code, and earn 20% commission tracked toward manual cash payouts.

### Surfaces

```text
/affiliate/signup         public signup
/affiliate                affiliate dashboard (their stats, code, products, payouts)
/affiliate/products       browse live catalog + request to promote
/admin/affiliates         admin: approve affiliates, approve product requests, mark payouts paid
```

Athlete portal stays untouched. An athlete can optionally also have an affiliate profile, but the two are independent records.

### Database (one migration)

- `affiliates` — `user_id` (unique FK auth.users), `display_name`, `code` (unique, auto-generated NAME + 4 digits), `status` (`pending` | `active` | `paused`), `commission_percent` default 20, `payout_method_notes`, `total_earned`, `total_paid`, `balance_owed`.
- `affiliate_product_requests` — `affiliate_id`, `product_id`, `status` (`pending` | `approved` | `rejected`), `requested_at`, `decided_at`, `decided_by`, `notes`. Unique on (affiliate_id, product_id).
- `affiliate_sales` — `affiliate_id`, `code`, `shopify_order_id` (nullable FK), `order_line_item_id` (nullable), `product_id`, `gross_amount`, `commission_amount`, `status` (`pending` | `approved` | `paid` | `void`), `attributed_at`.
- `affiliate_payouts` — `affiliate_id`, `amount`, `method` (`venmo` | `ach` | `paypal` | `other`), `reference`, `notes`, `paid_at`, `paid_by`. Trigger updates `total_paid` + `balance_owed`.
- RLS: affiliate sees only their own rows; admin full access; service_role full access for the Shopify webhook handler. Service-definer `approve_affiliate_request`, `record_affiliate_sale`, `record_affiliate_payout` for safe writes.

### Attribution

Shopify discount codes are the source of truth. On affiliate approval we provision a Shopify price-rule + discount code (e.g. `JORDAN1284-10` for 10% off buyer) via a new `affiliate-provision-code` edge function. Existing Shopify order webhook is extended: when an incoming order's `discount_codes[]` matches an affiliate's code, we call `record_affiliate_sale` per line item, recording 20% of line subtotal as commission in `pending` status. Refunds flip the row to `void`.

### Affiliate dashboard (`/affiliate`)

- Header card: code, share link `https://shop.xyz/?ref=CODE`, copy button, status badge.
- Stat cards: balance owed, lifetime earned, lifetime paid, sales this month.
- Products tab: requested + approved products with per-product sales + commission.
- Sales tab: line-item table with status chips.
- Payouts tab: history with date, method, amount, reference.

### Admin (`/admin/affiliates`)

- Affiliates list with status filter, inline approve/pause.
- Detail drawer: edit commission %, view sales, "Mark Payout" dialog (amount, method, reference) → inserts payout row.
- Product requests queue across all affiliates with bulk approve/reject.
- Nav entry added to `AdminSidebar` ("Affiliates", Handshake icon).

### Public signup (`/affiliate/signup`)

Email + password (Supabase auth) → creates `affiliates` row in `pending` with auto-generated code from display name + 4-digit hash. After signup user lands on dashboard with "Pending approval" banner; product browsing locked until admin approves.

### Technical notes

- New tables follow the standard GRANT block; all writes via SECURITY DEFINER functions.
- Code generation: `slugify(display_name).slice(0,8).toUpperCase() + random 4 digits`, regen on collision.
- Buyer discount % (Shopify side) is configurable per affiliate but defaults to 10% off — separate from the 20% commission.
- Webhook attribution is idempotent (unique on `shopify_order_line_item_id`).
- No Stripe Connect, no automated payouts — admin records each payout manually; balance_owed is computed `total_earned - total_paid` via trigger.
- Phase 2 (not in this build): affiliate-branded storefront page, leaderboards, tiered commissions.

### Files to add/edit

- migration: tables + RLS + functions
- edge: `supabase/functions/affiliate-provision-code/index.ts`, extend existing Shopify order webhook handler
- `src/pages/affiliate/AffiliateSignup.tsx`, `AffiliateDashboard.tsx`, `AffiliateProducts.tsx`
- `src/components/affiliate/*` (StatCards, SalesTable, PayoutsTable, ProductRequestCard)
- `src/pages/admin/AffiliatesList.tsx`, `AffiliateDetail.tsx`, `ProductRequestsQueue.tsx`
- `src/hooks/useAffiliate.ts`, `useAffiliateSales.ts`
- routes in `App.tsx`, nav entry in `AdminSidebar.tsx`, guard `RequireAffiliate` in `auth/guards.tsx`
