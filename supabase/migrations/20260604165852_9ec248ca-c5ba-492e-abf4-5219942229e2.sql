-- Partial credit refund: refund a specific amount back to wallet (used for altered/cancelled orders)
create or replace function public.refund_order_credit_partial(_order_id uuid, _amount numeric, _notes text default 'Order adjustment refund')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete uuid;
  v_applied numeric(10,2);
  v_wallet public.athlete_credit_wallets%rowtype;
  v_add numeric(10,2);
  v_new numeric(10,2);
begin
  if _amount is null or _amount <= 0 then return 0; end if;

  select athlete_id, coalesce(credit_applied,0) into v_athlete, v_applied
    from public.bulk_order_requests where id = _order_id;
  if v_athlete is null then raise exception 'Order not found'; end if;

  if not public.current_user_is_admin() and not exists (
    select 1 from public.user_athlete_links where athlete_id = v_athlete and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  -- Cannot refund more than was applied
  if _amount > v_applied then
    raise exception 'Refund amount (%) exceeds credit applied (%)', _amount, v_applied;
  end if;

  select * into v_wallet from public.athlete_credit_wallets where athlete_id = v_athlete for update;
  v_add := least(_amount, greatest(v_wallet.max_balance - v_wallet.balance, 0));
  v_new := v_wallet.balance + v_add;

  update public.athlete_credit_wallets
    set balance = v_new, total_used = greatest(total_used - _amount, 0)
    where id = v_wallet.id;

  update public.bulk_order_requests
    set credit_applied = greatest(coalesce(credit_applied,0) - _amount, 0)
    where id = _order_id;

  insert into public.athlete_credit_transactions
    (wallet_id, athlete_id, order_request_id, type, amount, balance_after, notes, created_by)
    values (v_wallet.id, v_athlete, _order_id, 'refund', v_add, v_new, _notes, auth.uid());

  return v_new;
end $$;

revoke execute on function public.refund_order_credit_partial(uuid, numeric, text) from anon, public;
grant execute on function public.refund_order_credit_partial(uuid, numeric, text) to authenticated;
