
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('athlete-credit-monthly-accrual');
exception when others then null;
end $$;

select cron.schedule(
  'athlete-credit-monthly-accrual',
  '5 0 1 * *',
  $$ select public.accrue_monthly_credits(); $$
);
