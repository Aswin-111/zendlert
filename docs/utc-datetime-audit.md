# UTC Datetime Audit (Verification Only)

Snapshot date: 2026-03-08

## Scope

- Read/audited:
  - `prisma/schema.prisma`
  - `controllers/*.js`
  - `services/*.js`
  - `utils/*.js`
  - `helpers/*.js`
  - `docs/utc-datetime-policy.md`
- Audit type: verification-only (no behavior changes).

## Summary Verdict

- Application-level DateTime write paths that explicitly set datetime fields in Prisma `create/update/upsert` are UTC-normalized or UTC-clock-based.
- No remaining raw incoming datetime write path was found that directly persists request datetime values without shared UTC normalization.
- Repo is consistent enough to rely on frontend timezone conversion, with the caveats listed under "Manual Review / Gaps".

## Prisma DateTime Write Inventory

| Location | Prisma write path | DateTime fields written | UTC handling status |
|---|---|---|---|
| `services/alert.service.js` (`createAlertForOrganization` -> `createAlertWithTargets`) | `tx.alerts.create(...)` | `start_time`, `scheduled_time` | `scheduled_time` comes from `normalizeIncomingDateTimeToUtc(...)`; `start_time` uses `utcNow()` for send-now. |
| `services/alert.service.js` (`processAlertNotificationJob`) | `prisma.alerts.update(...)` | `start_time` | Uses `utcNow()` fallback (`start_time: ... ?? now`). |
| `services/alert.service.js` (`resolveAlertForOrganization`) | `prisma.alerts.update(...)` | `end_time`, `resolved_at` | Uses `utcNow()` for both fields. |
| `controllers/admin.controller.js` (`createUser`) | `tx.invitations.create(...)` | `expires_at`, `sent_at` | `sent_at` from `utcNow()`; `expires_at` derived from that UTC instant. |
| `controllers/admin.controller.js` (`createAlert`) | `prisma.alerts.create(...)` | `start_time`, `end_time` | Both normalized via `normalizeIncomingDateTimeToUtc(...)` before save. |
| `controllers/subscription.controller.js` (`createSubscription`) | `prisma.subscriptions.create(...)` | `current_period_start`, `current_period_end` (`@db.Date`) | Normalized via `normalizeUnixSecondsToUtcDateOnly(...)` / `normalizeIncomingDateOnlyToUtc(...)`. |
| `controllers/subscription.controller.js` (`handleWebhook` invoice success) | `prisma.subscriptions.update(...)` | `current_period_end`, `updated_at` | `current_period_end` normalized to UTC date-only; `updated_at` uses `utcNow()`. |
| `controllers/subscription.controller.js` (`handleWebhook` payment_failed/deleted) | `prisma.subscriptions.update(...)` | `updated_at` | Uses `utcNow()`. |
| `services/employeeAlertResponse.service.js` (`upsertRecipientResponse`) | `tx.notification_Recipients.upsert(...)` | `delivered_at`, `acknowledged_at`, `response_updated_at` | Uses `utcNow()` for create/update timestamps. |
| `services/employeeAlertResponse.service.js` (`upsertRecipientResponse`) | `tx.alerts.updateMany(...)` | `start_time` | Uses `alert.scheduled_time ?? now` where `now = utcNow()`. |
| `services/chat.service.js` (`UpdateMessageStatus`) | `prisma.chat_Messages.update(...)` | `read_at` | Uses `utcNow()` when status is `read`. |
| `helpers/alert-queue.helper.js` (`startAlertNotificationWorker`) | `prisma.alerts.update(...)` | `start_time` | Uses `utcNow()` fallback (`... ?? now` / `{ start_time: now }`). |

## Remaining Direct Date Constructor Usage (Audit Focus)

- `controllers/admin.controller.js:772`
  - `expiresAt = new Date(inviteSentAt.getTime() + ...)`
  - This bypasses helper parsing, but is derived from `inviteSentAt` produced by `utcNow()`. No incoming timezone ambiguity.
- `controllers/subscription.controller.js:119`
  - `fallbackPeriodEndInstant = new Date(Date.now() + ...)`
  - Then normalized via `normalizeIncomingDateOnlyToUtc(...)` before write.

No remaining direct raw incoming datetime write (from request payload) was found that bypasses `utils/datetime.js` on fields that are explicitly persisted as DateTime.

## Manual Review / Gaps

- `helpers/alert-queue.helper.js` appears to be an alternate worker path; current bootstrap uses `services/queue.service.js` + `services/alert.service.js`. Confirm runtime path to avoid drift.
- `Phone_Verifications` DateTime fields (`code_sent_at`, `expires_at`, `verified_at`) exist in schema, but no active Prisma write path was found in current controllers/services/helpers.
- Some DateTime fields are DB-defaulted (`@default(now())`) rather than app-assigned (for example `Visitor_Status.reported_at`, `User_Locations.timestamp`, `Chat_Messages.sent_at`). These are outside app-level normalization and depend on DB timezone/storage behavior.

## Final Assessment

- For explicit application-level DateTime writes, UTC handling is consistent and centralized enough to rely on frontend timezone rendering.
- Recommended operational guardrail: keep database/server timezone configuration UTC so DB-default `now()` fields remain aligned with policy.
