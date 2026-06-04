
-- Enums
do $$ begin
  create type public.credit_txn_type as enum ('accrual','used','adjustment','refund');
exception when duplicate_object then null; end $$;

-- Wallets
create table if not exists public.athlete_credit_wallets (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes(id) on delete cascade,
  balance numeric(10,2) not null default 0,
  monthly_credit numeric(10,2) not null default 500,
  max_balance numeric(10,2) not null default 3000,
  total_earned numeric(10,2) not null default 0,
  total_used numeric(10,2) not null default 0,
  last_accrual_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.athlete_credit_wallets to authenticated;
grant all on public.athlete_credit_wallets to service_role;
alter table public.athlete_credit_wallets enable row level security;

create policy "wallet_self_read" on public.athlete_credit_wallets
  for select to authenticated using (
    public.current_user_is_admin()
    or exists (select 1 from public.user_athlete_links l
               where l.athlete_id = athlete_credit_wallets.athlete_id
                 and l.user_id = auth.uid())
  );
create policy "wallet_admin_all" on public.athlete_credit_wallets
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create trigger trg_wallet_updated_at before update on public.athlete_credit_wallets
  for each row execute function public.set_updated_at();

-- Transactions
create table if not exists public.athlete_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.athlete_credit_wallets(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  order_request_id uuid references public.bulk_order_requests(id) on delete set null,
  type public.credit_txn_type not null,
  amount numeric(10,2) not null,
  balance_after numeric(10,2) not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_txn_wallet on public.athlete_credit_transactions(wallet_id, created_at desc);
create index if not exists idx_credit_txn_order on public.athlete_credit_transactions(order_request_id);
grant select on public.athlete_credit_transactions to authenticated;
grant all on public.athlete_credit_transactions to service_role;
alter table public.athlete_credit_transactions enable row level security;

create policy "txn_self_read" on public.athlete_credit_transactions
  for select to authenticated using (
    public.current_user_is_admin()
    or exists (select 1 from public.user_athlete_links l
               where l.athlete_id = athlete_credit_transactions.athlete_id
                 and l.user_id = auth.uid())
  );
create policy "txn_admin_all" on public.athlete_credit_transactions
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- Add payment columns to bulk_order_requests
alter table public.bulk_order_requests
  add column if not exists credit_applied numeric(10,2) not null default 0,
  add column if not exists amount_due numeric(10,2),
  add column if not exists payment_method text not null default 'invoice';

-- Auto-create wallet for new athletes
create or replace function public.ensure_athlete_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.athlete_credit_wallets (athlete_id) values (new.id)
  on conflict (athlete_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_athlete_wallet on public.athletes;
create trigger trg_athlete_wallet after insert on public.athletes
  for each row execute function public.ensure_athlete_wallet();

-- Backfill existing athletes
insert into public.athlete_credit_wallets (athlete_id)
select a.id from public.athletes a
left join public.athlete_credit_wallets w on w.athlete_id = a.id
where w.id is null;

-- Monthly accrual (idempotent per calendar month)
create or replace function public.accrue_monthly_credits()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
  v_add numeric(10,2);
  v_new numeric(10,2);
begin
  for r in select * from public.athlete_credit_wallets
           where last_accrual_at is null
              or date_trunc('month', last_accrual_at) < date_trunc('month', now())
  loop
    v_add := least(r.monthly_credit, greatest(r.max_balance - r.balance, 0));
    if v_add > 0 then
      v_new := r.balance + v_add;
      update public.athlete_credit_wallets
        set balance = v_new,
            total_earned = total_earned + v_add,
            last_accrual_at = now()
      where id = r.id;
      insert into public.athlete_credit_transactions
        (wallet_id, athlete_id, type, amount, balance_after, notes)
        values (r.id, r.athlete_id, 'accrual', v_add, v_new, 'Monthly credit');
      v_count := v_count + 1;
    else
      update public.athlete_credit_wallets set last_accrual_at = now() where id = r.id;
    end if;
  end loop;
  return v_count;
end $$;

-- Apply credit to an order
create or replace function public.apply_credit_to_order(_order_id uuid, _amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_athlete uuid;
  v_wallet public.athlete_credit_wallets%rowtype;
  v_new numeric(10,2);
begin
  if _amount is null or _amount <= 0 then return 0; end if;

  select athlete_id into v_athlete from public.bulk_order_requests where id = _order_id;
  if v_athlete is null then raise exception 'Order not found'; end if;

  -- caller must be admin or linked to athlete
  if not public.current_user_is_admin() and not exists (
    select 1 from public.user_athlete_links where athlete_id = v_athlete and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  if _amount > v_wallet.balance then raise exception 'Insufficient credit'; end if;

  v_new := v_wallet.balance - _amount;
  update public.athlete_credit_wallets
    set balance = v_new, total_used = total_used + _amount
    where id = v_wallet.id;

  update public.bulk_order_requests
    set credit_applied = coalesce(credit_applied,0) + _amount
    where id = _order_id;

  insert into public.athlete_credit_transactions
    (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'used', -_amount, v_new, 'Applied to order', auth.uid());

  return v_new;
end $$;

-- Refund credit (e.g., on cancel)
create or replace function public.refund_order_credit(_order_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_athlete uuid;
  v_applied numeric(10,2);
  v_wallet public.athlete_credit_wallets%rowtype;
  v_add numeric(10,2);
  v_new numeric(10,2);
begin
  select athlete_id, coalesce(credit_applied,0) into v_athlete, v_applied
    from public.bulk_order_requests where id = _order_id;
  if v_athlete is null or v_applied <= 0 then return 0; end if;

  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  v_add := least(v_applied, greatest(v_wallet.max_balance - v_wallet.balance, 0));
  v_new := v_wallet.balance + v_add;

  update public.athlete_credit_wallets
    set balance = v_new, total_used = greatest(total_used - v_applied, 0)
    where id = v_wallet.id;

  update public.bulk_order_requests set credit_applied = 0 where id = _order_id;

  insert into public.athlete_credit_transactions
    (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'refund', v_add, v_new, 'Order cancelled refund', auth.uid());

  return v_new;
end $$;

-- Admin adjustment helper
create or replace function public.admin_adjust_credit(_athlete_id uuid, _amount numeric, _notes text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.athlete_credit_wallets%rowtype;
  v_new numeric(10,2);
  v_type public.credit_txn_type;
begin
  if not public.current_user_is_admin() then raise exception 'Admin only'; end if;
  select * into v_wallet from public.athlete_credit_wallets where athlete_id = _athlete_id for update;
  if v_wallet.id is null then raise exception 'Wallet not found'; end if;

  v_new := greatest(0, least(v_wallet.max_balance, v_wallet.balance + _amount));
  update public.athlete_credit_wallets
    set balance = v_new,
        total_earned = total_earned + greatest(_amount,0),
        total_used = total_used + greatest(-_amount,0)
    where id = v_wallet.id;

  v_type := 'adjustment';
  insert into public.athlete_credit_transactions
    (wallet_id, athlete_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, _athlete_id, v_type, _amount, v_new, _notes, auth.uid());
  return v_new;
end $$;
