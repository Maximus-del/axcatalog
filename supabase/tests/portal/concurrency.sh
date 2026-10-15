#!/usr/bin/env bash
# Two real sessions at once (run after `run.sh stage2`, which leaves the DB loaded).
#  A) same idempotency key submitted twice concurrently -> one order, one debit
#  B) two DIFFERENT orders racing for the same credit   -> never overspends
set -uo pipefail
db="${PORTAL_TEST_DB:-portal_test}"
tmp="$(mktemp -d)"; chmod 777 "$tmp"
run() { su postgres -c "psql -X -q -At -d $db -f $1"; }
q() { echo "$1" > "$tmp/q.sql"; run "$tmp/q.sql"; }
pre="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-0000000000d1\"}',false) \\g /dev/null
set role authenticated;"
M="'00000000-0000-0000-0000-00000000000d'"
item="'[{\"productId\":\"00000000-0000-0000-0000-0000000002d1\",\"quantity\":3}]'"

q "update athlete_credit_wallets set balance = 50 where athlete_id = $M;" >/dev/null
before=$(q "select count(*) from bulk_order_requests where athlete_id = $M;")

cat > "$tmp/a1.sql" <<SQL
begin;
$pre
select public.portal_submit_order_request($M,'44444444-0000-0000-0000-000000000001',$item,10)->>'replayed';
select pg_sleep(2);
commit;
SQL
cat > "$tmp/a2.sql" <<SQL
$pre
select public.portal_submit_order_request($M,'44444444-0000-0000-0000-000000000001',$item,10)->>'replayed';
SQL
run "$tmp/a1.sql" > "$tmp/a1.out" 2>&1 & sleep 0.5; run "$tmp/a2.sql" > "$tmp/a2.out" 2>&1; wait
afterA=$(q "select count(*) from bulk_order_requests where athlete_id = $M;")
balA=$(q "select balance from athlete_credit_wallets where athlete_id = $M;")
echo "A: first replayed=$(grep -E '^(true|false)$' $tmp/a1.out | head -1) second replayed=$(grep -E '^(true|false)$' $tmp/a2.out | head -1) orders +$((afterA-before)) balance $balA"

sed -e "s/44444444-0000-0000-0000-000000000001/44444444-0000-0000-0000-000000000002/; s/,10)->>'replayed'/,30)->>'creditApplied'/" "$tmp/a1.sql" > "$tmp/b1.sql"
sed -e "s/44444444-0000-0000-0000-000000000001/44444444-0000-0000-0000-000000000003/; s/,10)->>'replayed'/,30)->>'creditApplied'/" "$tmp/a2.sql" > "$tmp/b2.sql"
run "$tmp/b1.sql" > "$tmp/b1.out" 2>&1 & sleep 0.5; run "$tmp/b2.sql" > "$tmp/b2.out" 2>&1; wait
balB=$(q "select balance from athlete_credit_wallets where athlete_id = $M;")
echo "B: first credit=$(grep -E '^[0-9.]+$' $tmp/b1.out | head -1) second credit=$(grep -E '^[0-9.]+$' $tmp/b2.out | head -1) balance $balB"

okA=no; [ "$((afterA-before))" = "1" ] && grep -qx true "$tmp/a2.out" && [ "$balA" = "40.00" ] && okA=yes
c1=$(grep -E '^[0-9.]+$' $tmp/b1.out | head -1); c2=$(grep -E '^[0-9.]+$' $tmp/b2.out | head -1)
okB=$(awk -v a="${c1:-0}" -v b="${c2:-0}" -v bal="$balB" 'BEGIN{print (a+b<=40.0001 && bal+0>=0 && bal+0 == 40-a-b) ? "yes" : "no"}')
okC=skip
if [ "$(q "select to_regproc('public.portal_decide_concept') is not null;")" = "t" ]; then
  # C: two sessions approve the same concept version at once -> exactly one wins, the other gets 409.
  op="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-0000000000f1\"}',false) \\g /dev/null
set role authenticated;"
  cat > "$tmp/c0.sql" <<SQL
$pre
select public.portal_create_project($M, null, 'Race test', 'other', 'two approvals at once') ->> 'id' as id \gset
reset role;
$op
select public.portal_share_concept(:'id'::uuid, 'design-previews', 'race.png', 'Race') ->> 'conceptId' as cid \gset
select :'id' || ' ' || :'cid';
SQL
  read -r pid cid < <(run "$tmp/c0.sql" 2>/dev/null | tail -1)
  ver=$(q "select version from portal_threads where id = '$pid';")
  for n in 1 2; do
    cat > "$tmp/c$n.sql" <<SQL
begin;
$pre
select coalesce((public.portal_decide_concept($M, '$pid', '$cid', 1, $ver, 'approve') ->> 'status'), 'none');
select pg_sleep(1.5);
commit;
SQL
  done
  run "$tmp/c1.sql" > "$tmp/c1.out" 2>&1 & sleep 0.3; run "$tmp/c2.sql" > "$tmp/c2.out" 2>&1; wait
  wins=$(cat "$tmp/c1.out" "$tmp/c2.out" | grep -cx approved)
  stale=$(cat "$tmp/c1.out" "$tmp/c2.out" | grep -c "changed since you opened it")
  decisions=$(q "select count(*) from portal_project_decisions where concept_id = '$cid';")
  echo "C: approvals that won=$wins (want 1), refused as stale=$stale (want 1), decisions stored=$decisions (want 1)"
  okC=no; [ "$wins" = 1 ] && [ "$stale" = 1 ] && [ "$decisions" = 1 ] && okC=yes
fi
echo "---- concurrency: same-key duplicate=$okA  credit race=$okB  concurrent approvals=$okC"
rm -rf "$tmp"
[ "$okA" = yes ] && [ "$okB" = yes ] && [ "$okC" != no ]
