# UTC Datetime Policy

Snapshot date: 2026-03-08

## Policy

- Backend stores DateTime values in UTC.
- Backend does not convert stored UTC timestamps into local timezone for API responses.
- Frontend (Flutter) is responsible for local timezone rendering.

## Input Normalization Rules

Implemented in [`utils/datetime.js`](../utils/datetime.js):

- ISO datetime with timezone (`Z` or `+/-HH:mm`): preserved as the same instant.
- ISO datetime without timezone: interpreted as UTC to avoid server-local drift.
- Date-only strings (`YYYY-MM-DD`): normalized to UTC midnight to keep calendar-date semantics stable.
- Invalid datetime input: returns `null` from helper so existing endpoint validation/error handling can remain in place.

## Date-Only vs DateTime Handling

- `DateTime` columns (for example: `start_time`, `end_time`, `resolved_at`, `expires_at`) are stored as UTC instants.
- `@db.Date` columns (for example: subscription `current_period_start`, `current_period_end`) are normalized to UTC date-only values (UTC midnight) before persistence to prevent accidental day shifting.

## Updated Flows in This Batch

- `POST /api/v1/alert`
  - `timing_details.scheduled_time` now normalized to UTC before persistence.
  - File: `services/alert.service.js`

- `PUT /api/v1/alert/:alertId/resolve`
  - `end_time` and `resolved_at` continue to be set from server time, now via shared UTC helper clock.
  - File: `services/alert.service.js`

- `POST /api/v1/admin/alerts`
  - Incoming `start_time` and `end_time` normalized to UTC before save.
  - File: `controllers/admin.controller.js`

- `POST /api/v1/admin/users` (invitation creation path)
  - `expires_at` and `sent_at` use shared UTC helper clock.
  - File: `controllers/admin.controller.js`

- `POST /api/v1/subscriptions/create`
  - `current_period_start` and `current_period_end` normalized to UTC date-only values from Stripe period timestamps.
  - File: `controllers/subscription.controller.js`

- `POST /api/v1/subscriptions/webhook`
  - `current_period_end` normalized to UTC date-only value from Stripe invoice period timestamp.
  - `updated_at` uses shared UTC helper clock.
  - File: `controllers/subscription.controller.js`

- Employee alert response write path (`EmployeeController.respondToAlert` and gRPC `UpdateEmployeeResponse` service flow)
  - `delivered_at`, `acknowledged_at`, `response_updated_at`, and scheduled alert `start_time` now use shared UTC helper clock.
  - File: `services/employeeAlertResponse.service.js`

- Chat status update flow (gRPC `UpdateMessageStatus`)
  - `read_at` now uses shared UTC helper clock when status becomes `read`.
  - File: `services/chat.service.js`

- Alert notification worker activation flow
  - Scheduled->active `start_time` initialization now uses shared UTC helper clock.
  - File: `helpers/alert-queue.helper.js`

## Audited But Not Changed

- OTP expiry flow uses Redis TTL (`setEx`) and does not write DateTime fields to Prisma in current code paths.
- No active Prisma writes were found for `Phone_Verifications` datetime fields in current routes/controllers/services.
- `Visitor_Status.reported_at` and `User_Locations.timestamp` are currently DB-defaulted in create paths (no incoming datetime payload to normalize in this batch).
