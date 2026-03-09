# UTC Infrastructure Checklist

Snapshot date: 2026-03-08

## Objective

Ensure runtime/container/database timezone behavior is explicitly aligned to UTC so app-level UTC datetime policy remains reliable.

## Current State Audit

### 1) App container timezone (Node backend)

- `Dockerfile`:
  - No explicit `ENV TZ=UTC`.
  - No `tzdata` install or `/etc/localtime` setup.
- `docker-compose.yml` (`backend` service):
  - No `TZ` or `PGTZ` environment variable.
- `server.js` / `app.js`:
  - No startup check/assertion for `process.env.TZ`.

Status: not explicitly enforced (relies on image/runtime defaults).

### 2) Postgres timezone

- `docker-compose.yml` (`zendlert_db` service):
  - No `TZ` or `PGTZ` environment variable.
  - No `command` override like `postgres -c timezone=UTC`.
- `prisma/migrations/*.sql`:
  - No `ALTER DATABASE ... SET timezone = 'UTC'`.
  - No `SET TIME ZONE 'UTC'` bootstrap statements.
- `entrypoint.sh`:
  - Runs `prisma migrate deploy` only; no timezone/session enforcement.

Status: not explicitly enforced (relies on Postgres/container defaults).

### 3) App-level UTC normalization vs infra defaults

- `docs/utc-datetime-policy.md` and `docs/utc-datetime-audit.md` confirm explicit incoming datetime writes are normalized in code.
- `prisma/schema.prisma` still has multiple `@default(now())` DateTime columns.

Implication: DB-generated timestamps from `now()` depend on DB/session timezone behavior unless infra pins UTC.

## UTC-Safe Infra Checklist (Recommended)

- [ ] Set backend container timezone explicitly:
  - In `Dockerfile` or `docker-compose.yml`, set `TZ=UTC`.
- [ ] Set Postgres timezone explicitly at container runtime:
  - In `docker-compose.yml` for `zendlert_db`, add `TZ=UTC` and `PGTZ=UTC`.
- [ ] Force database timezone in Postgres startup config:
  - Add DB service command override: `postgres -c timezone=UTC`.
- [ ] Persist DB timezone at database level:
  - Add one-time SQL/init step: `ALTER DATABASE <db_name> SET timezone TO 'UTC';`
- [ ] Add startup verification hook (non-blocking log or fail-fast, as preferred):
  - App startup logs `process.env.TZ`.
  - App executes `SHOW TIME ZONE;` via DB connection and logs result.
- [ ] Add deployment/runbook check:
  - Verify UTC after deployment with:
    - `SHOW TIME ZONE;`
    - `SELECT now();`
    - compare app/server UTC timestamp logging.
- [ ] Keep app-level normalization helper as-is:
  - Continue using `utils/datetime.js` for incoming datetime values.

## Recommended Enforcement Point

If only one infra change is allowed initially, prioritize Postgres runtime/database timezone enforcement (`timezone=UTC` + `ALTER DATABASE ... SET timezone='UTC'`) because `@default(now())` fields are DB-generated.

## End-to-End Guarantee Assessment

- Current result: UTC is **strong at application write-path level**, but **not guaranteed end-to-end at infrastructure level** because container and DB timezone are not explicitly pinned in runtime configuration.
- After applying the checklist items above, UTC behavior can be treated as guaranteed end-to-end.
