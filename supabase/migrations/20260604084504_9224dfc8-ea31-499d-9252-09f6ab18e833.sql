
revoke execute on function public.accrue_monthly_credits() from anon, public;
revoke execute on function public.apply_credit_to_order(uuid, numeric) from anon, public;
revoke execute on function public.refund_order_credit(uuid) from anon, public;
revoke execute on function public.admin_adjust_credit(uuid, numeric, text) from anon, public;
revoke execute on function public.ensure_athlete_wallet() from anon, public;

grant execute on function public.apply_credit_to_order(uuid, numeric) to authenticated;
grant execute on function public.admin_adjust_credit(uuid, numeric, text) to authenticated;
grant execute on function public.refund_order_credit(uuid) to authenticated;
grant execute on function public.accrue_monthly_credits() to authenticated;
