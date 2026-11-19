#!/usr/bin/env bash
# Runs migrations + the SQL test-suite on a THROWAWAY plain-PostgreSQL database (stubs Supabase's auth/storage/roles).
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a superuser connection string for a scratch server}"
DB="ksl_test_$$"; BASE="${DATABASE_URL%/*}"
psql "$DATABASE_URL" -qc "create database $DB"
trap 'psql "$DATABASE_URL" -qc "drop database if exists $DB" >/dev/null' EXIT
P="psql $BASE/$DB -v ON_ERROR_STOP=1 -q"
$P -f supabase/tests/plain-postgres-stub.sql
for f in supabase/migrations/*.sql; do echo "applying $f"; $P -f "$f" 2>&1 | grep -v NOTICE || true; done
$P -f supabase/tests/rls_and_workflows.test.sql 2>&1 | grep -E "PASS|FAIL|ERROR|ALL SQL" | sed 's/NOTICE:  //'
