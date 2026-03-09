# UTC Manual Review Resolution

Snapshot date: 2026-03-08

## Scope

- `docs/utc-datetime-audit.md`
- `docs/utc-datetime-policy.md`
- `helpers/alert-queue.helper.js`
- `services/queue.service.js`
- `services/alert.service.js`
- `controllers/*.js`
- `services/*.js`
- `helpers/*.js`
- `server.js`

## 1) Real Production Alert Worker / Runtime Path

Confirmed active runtime path:

1. Queue producer:
   - `controllers/alert.controller.js` imports `notificationQueue` from `services/queue.service.js`.
   - `AlertController.createAlert` passes that queue instance into `createAlertForOrganization(...)`.
   - `services/alert.service.js` enqueues jobs via `enqueueAlertNotificationJob(notificationQueue, ...)`.
2. Queue consumer/worker bootstrap:
   - `server.js` imports `startNotificationWorker` from `services/queue.service.js`.
   - `server.js` starts worker with processor callback that calls `processAlertNotificationJob(prisma, job?.data)` from `services/alert.service.js`.
3. Worker implementation:
   - `services/queue.service.js` creates the BullMQ `Worker` for `notificationQueue`.

Resolution: production runtime path is `services/queue.service.js` + `services/alert.service.js` (not helper-based).

## 2) Status of `helpers/alert-queue.helper.js`

Findings:

- `helpers/alert-queue.helper.js` defines its own `notificationQueue` and `startAlertNotificationWorker`.
- Repository search found no imports/usages of:
  - `startAlertNotificationWorker`
  - `helpers/alert-queue.helper.js`
  - helper-defined `notificationQueue`
- Active boot path is already handled by `server.js` + `services/queue.service.js`.

Status: **redundant / inactive** in current runtime (effectively deprecated by the active service-based worker path).

UTC impact:

- No current production impact from helper worker path because it is not wired.
- It can still cause future drift/confusion if someone starts using it without noticing the active path.

## 3) Active `Phone_Verifications` Prisma Write Paths

Search results:

- No Prisma write calls to `phone_Verifications` / `Phone_Verifications` in `controllers/*.js`, `services/*.js`, or `helpers/*.js`.
- Repo-wide `Phone_Verifications` references were found only in:
  - `prisma/schema.prisma`
  - historical migration SQL
  - UTC documentation files

Related OTP flows currently in use:

- `controllers/organization.controller.js` uses Redis OTP (`setEx/get/del`) for both org and employee OTP flows.
- No current write path persists OTP lifecycle timestamps into `Phone_Verifications`.

Resolution: **no active Phone_Verifications write path exists in current application runtime**.

## 4) UTC Handling Conclusion for Manual-Review Items

- Alert worker runtime path: resolved and confirmed (service-based).
- `helpers/alert-queue.helper.js`: confirmed inactive/redundant.
- `Phone_Verifications` writes: none active; therefore no UTC write-normalization gap currently exists for that model in runtime code.

## Files That May Still Need UTC Follow-Up

- `helpers/alert-queue.helper.js`
  - Follow-up: either remove/archive or add explicit "inactive/deprecated" note to prevent accidental dual-worker reintroduction.
- `controllers/organization.controller.js` (OTP flows)
  - Follow-up only if the team reintroduces DB-backed phone verification storage; if added later, use `utils/datetime.js` normalization for datetime writes.
- `prisma/schema.prisma` (`Phone_Verifications` model)
  - Follow-up only if this model becomes active in controllers/services.
