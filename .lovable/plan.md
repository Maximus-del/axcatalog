## Athlete Credit System

Add a monthly merchandise-credit wallet for each athlete ($500/mo, $3,000 cap) with checkout integration, admin controls, and transaction history.

### 1. Database (single migration)

**`athlete_credit_wallets`**
- `athlete_id` (unique FK → athletes)
- `balance` numeric (default 0)
- `monthly_credit` numeric (default 500)
- `max_balance` numeric (default 3000)
- `total_earned` numeric (default 0)
- `total_used` numeric (default 0)
- `last_accrual_at` timestamptz
- timestamps

**`athlete_credit_transactions`**
- `wallet_id`, `athlete_id`
- `order_request_id` (nullable FK → bulk_order_requests)
- `type` enum: `accrual` | `used` | `adjustment` | `refund`
- `amount` numeric (signed: + adds, − uses)
- `balance_after` numeric
- `notes` text
- `created_by` (admin user id, nullable for system accruals)
- `created_at`

**`bulk_order_requests` additions**
- `credit_applied` numeric default 0
- `payment_method` text default `'invoice'` (`credit` | `invoice` | `card` | `split`)
- `amount_due` numeric (computed at submit)

**RLS + GRANTS**
- Athletes (via `user_athlete_links`) can read their own wallet + transactions.
- Admins (`current_user_is_admin`) full access.
- service_role full access for cron + edge functions.

**Functions**
- `accrue_monthly_credits()` — adds monthly_credit to each wallet capped at max_balance; writes accrual transactions; sets `last_accrual_at`. Idempotent per calendar month.
- `apply_credit_to_order(_order_id, _amount)` — security-definer: validates athlete owns order, subtracts from wallet, inserts `used` transaction, updates order row.
- `refund_order_credit(_order_id)` — on cancellation reverses credit (capped at max_balance).
- Trigger: auto-create wallet row when athlete is inserted; backfill existing athletes.

**Cron (separate insert, not migration)**
- `pg_cron` job 1st of month 00:05 UTC → calls `accrue_monthly_credits()`.

### 2. Edge functions
None required initially — all logic via Postgres functions invoked from client with RLS gating. (Admin adjustments go through `apply_credit_to_order`/direct insert with admin policy.)

### 3. Frontend — Athlete portal

**`src/hooks/useAthleteCredit.ts`** — fetch wallet + recent transactions, realtime subscribe.

**`src/components/portal/CreditWalletCard.tsx`** — dashboard card showing Available / Monthly / Max with progress bar + "Use Credit on New Order" button (scrolls to bulk sheet).

Mount in `PortalHome.tsx` above HubCardsRow.

**Checkout integration** in `BulkOrderSheet.tsx` and `ProductOrderDialog.tsx`:
- Payment method selector: Credit / Invoice / Split
- Credit slider/input (max = min(balance, subtotal))
- Show: Subtotal, Credit applied, Amount due
- On submit: insert order, then call `apply_credit_to_order` RPC.

### 4. Frontend — Admin

**`src/pages/admin/AthleteCredits.tsx`** — table of all athletes with balance, monthly, max, last accrual; row actions:
- Add / Subtract credit (dialog → insert adjustment transaction)
- Edit monthly amount + max
- View full transaction history (drawer)
- View orders paid with credit (link to OrdersList filtered)

Add nav entry in `AdminSidebar` + route in `App.tsx`.

**`OrderDetail.tsx`** — show Credit Applied / Amount Due / Payment Method block.

### 5. Rules enforced
- Cap at $3,000 in accrual + adjustment functions.
- `apply_credit_to_order` rejects amount > balance or > order total.
- Cancellation handler (existing order status change) calls `refund_order_credit`.
- Credit-only (no cash withdrawal) — no UI surface for withdrawal.

### Technical notes
- Numeric(10,2) for money columns.
- All money math server-side via SECURITY DEFINER functions to prevent tampering.
- `volume_discount_tiers` already drive the subtotal — credit applies after discount on final subtotal.
- Pg_cron + pg_net required; enable in migration if not already.
