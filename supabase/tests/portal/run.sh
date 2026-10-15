#!/usr/bin/env bash
# Usage: supabase/tests/portal/run.sh <stage>   e.g. run.sh stage1
# Loads the harness, every portal migration up to and including the stage, then the stage's tests.
# Needs a local Postgres you can reach as the `postgres` superuser. Never point it at production.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mig="$here/../../migrations"
db="${PORTAL_TEST_DB:-portal_test}"
psql_() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $db $*"; }
su postgres -c "dropdb --if-exists $db && createdb $db"
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $db -f $here/harness.sql" > /dev/null
for f in "$here"/stage*.extra.sql; do [ -e "$f" ] && su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $db -f $f" > /dev/null; done
for f in $(ls "$mig"/*_portal_stage*.sql | sort); do
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $db -f $f" > /dev/null
  case "$f" in *"$1"*) break;; esac
done
for f in $(ls "$here"/stage*.test.sql | sort); do
  su postgres -c "psql -X -q -d $db -f $f" > /dev/null 2>&1 || true
  case "$f" in *"$1"*) break;; esac
done
su postgres -c "psql -X -d $db -At -F ' | ' -c \"select case when ok then 'PASS' else 'FAIL' end, name, coalesce(detail,'') from t.results order by ok, name\""
fails=$(su postgres -c "psql -X -d $db -At -c 'select count(*) from t.results where not ok'")
total=$(su postgres -c "psql -X -d $db -At -c 'select count(*) from t.results'")
written=0
for f in $(ls "$here"/stage*.test.sql | sort); do
  written=$((written + $(grep -c 't.check(' "$f")))
  case "$f" in *"$1"*) break;; esac
done
echo "---- $total checks ran of $written written, $fails failed"
[ "$fails" = "0" ] && [ "$total" = "$written" ]
