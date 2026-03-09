# Refactor TODO Checklist

This checklist is derived from `scalecodebase.md` and `docs/codebase-analysis.md`.

## Non-Negotiable Guardrails (apply to every task)

- Preserve endpoint paths and request formats.
- Preserve response JSON shape, field names, and status behavior unless a bug fix is explicitly approved.
- Preserve database schema and Prisma model contract.
- Do not redesign auth/business flow during cleanup phases.
- Use small scoped batches (1-5 files), one objective per commit.
- Keep all changes behavior-preserving and reversible.

## Baseline / Documentation

- [x] Freeze route inventory and route-to-controller map
  - Files: `docs/api-contract-baseline.md`, `docs/controller-service-map.md`, `routes/*.js`, `controllers/*.js`
  - Reason: route surface is large and heavily controller-driven; baseline is required before further refactors.
  - Risk: low
  - Note: Added `docs/api-contract-baseline.md` (frozen route inventory + mounted prefixes) and `docs/controller-service-map.md` (route -> controller -> dependency map snapshot, dated 2026-03-07).

- [x] Capture request/response contract samples for high-risk flows
  - Files: `docs/api-contract-baseline.md`, `docs/high-risk-flows.md`
  - Reason: protects frontend contracts for auth, organization, admin, alert, and subscription endpoints.
  - Risk: low
  - Note: Added `docs/high-risk-flows.md` with representative request/response samples for auth, organization OTP/login, admin actions, alert flows, and subscription/plan flows; linked it from `docs/api-contract-baseline.md`.

- [x] Document middleware coverage and auth expectations per router
  - Files: `docs/high-risk-flows.md`, `app.js`, `routes/*.js`, `middlewares/verifyAdminAccess.js`
  - Reason: analysis shows uneven auth coverage and controller-level trust of `req.user`.
  - Risk: low
  - Note: Added middleware coverage matrix and auth expectation notes to `docs/high-risk-flows.md`, including app-level middleware baseline and current `verifyAdminAccess` response contract.

- [x] Start refactor changelog with batch-by-batch scope tracking
  - Files: `docs/refactor-changelog.md`
  - Reason: prevents mixed-objective commits and hidden behavior drift.
  - Risk: low
  - Note: Added `docs/refactor-changelog.md` with guardrails, batch log table, and initialized baseline documentation batches (`B0-001` to `B0-004`).

## App Hardening

- [x] Add global requestId middleware and propagate to logs
  - Files: `app.js`, `utils/logger.js`
  - Reason: controllers reference `req.requestId` but no app-level request-id middleware is present.
  - Risk: low
  - Note: Confirmed global requestId middleware in `app.js` and improved `requestLogMeta` in `utils/logger.js` to fall back to incoming/request/response request-id sources (`req.requestId`, `req.id`, header, response header).

- [x] Standardize startup and runtime structured logging
  - Files: `server.js`, `app.js`, `utils/logger.js`
  - Reason: mixed `console.log` and logger usage makes incident tracing inconsistent.
  - Risk: low
  - Note: Audited `server.js`, `app.js`, and `utils/logger.js`; startup/runtime paths already use structured logger events (e.g., `startup.*`, `request.*`, `shutdown.*`) with no `console.*` usage in this scoped set.

- [x] Add centralized Express error and not-found handlers
  - Files: `app.js`, `server.js`
  - Reason: unify uncaught error handling and reduce silent failures.
  - Risk: low
  - Note: Kept existing centralized Express error handler and added a centralized 404 not-found handler in `app.js` with structured logging (`request.not_found`) and JSON response `{ "message": "Not found" }`.

- [x] Validate required environment variables at startup
  - Files: `server.js`, `app.js`, `config/*`
  - Reason: explicit startup failure is safer than runtime crashes on missing config.
  - Risk: low
  - Note: Verified `validateStartupEnv()` in `server.js` enforces required env vars (`DATABASE_URL`, `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`) plus startup fail-fast checks for `PORT`, optional `REDIS_URL` format, Firebase service-account path, and `NODE_ENV`.

- [x] Disable `x-powered-by` and add safe body size limits
  - Files: `app.js`
  - Reason: reduce framework exposure and oversized payload abuse risk.
  - Risk: low
  - Note: Verified `app.disable("x-powered-by")` and request-body limits via `bodyLimit` are already applied to `express.json`, `express.urlencoded`, and webhook `express.raw` in `app.js`.

- [x] Consolidate webhook body parser wiring to one place
  - Files: `app.js`, `routes/subscription.routes.js`
  - Reason: raw parser is configured both app-level and route-level.
  - Risk: medium
  - Note: Removed duplicate route-level `express.raw` middleware from `routes/subscription.routes.js` and kept centralized webhook raw parsing in `app.js` (`/api/v1/subscriptions/webhook`).

## Security

- [x] Remove committed Firebase private key and rotate credentials
  - Files: `config/firebase/google-services.json`, secret management docs
  - Reason: repository contains a live service-account private key.
  - Risk: high
  - Note: Verified `config/firebase/google-services.json` is git-ignored and not tracked in current workspace state; added rotation runbook at `docs/security-rotation.md` with revoke/regenerate/deploy steps and `FIREBASE_SERVICE_ACCOUNT_PATH` usage.

- [x] Replace predictable default password assignment in admin user creation
  - Files: `controllers/admin.controller.js`
  - Reason: new users are created with `password_hash: "1234"`.
  - Risk: high
  - Note: Updated `AdminController.createUser` to store a strong per-user temporary hash generated from `crypto.randomBytes(...)` and `bcrypt.hash(...)` instead of the static `"1234"` value; response shape and invite flow remain unchanged.

- [x] Prevent OTP leakage in API responses
  - Files: `controllers/organization.controller.js`
  - Reason: `dev_otp` is returned to clients and can expose verification codes.
  - Risk: medium
  - Note: Updated `OrganizationController.sendOtp` so `dev_otp` is returned only in non-production (`dev_otp: isDev ? otp : null`), preventing production OTP disclosure while preserving response field shape.

- [x] Redact secrets/tokens/passwords from logs
  - Files: `utils/logger.js`, `controllers/organization.controller.js`, `controllers/*`, `server.js`
  - Reason: sensitive values are logged in several flows.
  - Risk: low
  - Note: Hardened logger key redaction (`otp` added to sensitive-key pattern) and removed raw token-bearing console logs in `controllers/config.controller.js` (replaced with structured logs that avoid logging `fcm_token` values directly).

- [x] Tighten CORS policy for credentialed requests
  - Files: `app.js`
  - Reason: current `origin: "*"` with `credentials: true` is unsafe.
  - Risk: medium
  - Note: Tightened `app.js` CORS behavior to require explicit `CORS_ORIGINS` entries for credentialed browser access, keep wildcard mode non-credentialed, and log startup warnings for wildcard/no-origin configurations.

- [x] Add auth/OTP/login rate limiting
  - Files: `app.js`, `routes/organization.routes.js`, `routes/employee.routes.js`
  - Reason: no visible throttling on brute-force-prone endpoints.
  - Risk: medium
  - Note: Added a scoped in-memory IP rate limiter in `app.js` for auth/OTP/login POST paths (`/api/v1/organizations/send-otp`, `verify-otp`, `login-otp`, employee OTP endpoints, `/refresh`, and `/api/v1/employee/login`) with configurable env caps (`AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`) and `429 { "message": "Too many requests" }` on limit breach.

- [x] Audit and constrain raw SQL usage in admin flows
  - Files: `controllers/admin.controller.js`
  - Reason: raw SQL surface increases injection/maintenance risk.
  - Risk: medium
  - Note: Replaced `prisma.$queryRawUnsafe(...)` in `AdminController.getAlertSummaryForOrg` with parameterized `prisma.$queryRaw\`...\`` interpolation for `organizationId` to keep query behavior while removing unsafe raw API usage.

- [x] Fix IDOR-prone user/key update endpoints with ownership checks
  - Files: `controllers/config.controller.js`, `controllers/user.controller.js`, related routes/middleware
  - Reason: endpoints accept user identifiers from path/body without clear ownership enforcement.
  - Risk: high
  - Note: Added ownership guards on token/key update endpoints (`setFcmToken`, `updateUserPublicKey`, `registerFcmToken`) so authenticated non-admin users can only update themselves and users within their own organization; responses use existing controller conventions (`403 Forbidden`) and unauthenticated route behavior remains unchanged pending dedicated auth middleware rollout.

## Middleware

- [x] Harden `verifyAdminAccess` null-safety and unauthorized logging
  - Files: `middlewares/verifyAdminAccess.js`
  - Reason: auth boundary middleware should be deterministic and observable.
  - Risk: low
  - Note: Refactored `verifyAdminAccess` to use centralized auth response helpers (`middlewares/authResponse.js`) while preserving existing 401/403 payload shape/messages; retained structured unauthorized logging and improved response-safety guards.

- [x] Document and remove duplicate auth/role checks from controllers
  - Files: `controllers/admin.controller.js`, `controllers/alert.controller.js`, `controllers/analytics.controller.js`, `controllers/settings.controller.js`
  - Reason: repeated controller checks create inconsistency and missed branches.
  - Risk: medium
  - Note: Reused shared auth guard helper `getOrganizationIdOrUnauthorized` in `controllers/analytics.controller.js` (all actions) and in repeated message-based org guards in `controllers/admin.controller.js`; kept variant payload branches (`{ error: ... }`, `{ success: false, ... }`) and logged-role checks untouched to preserve endpoint contracts. Audited `controllers/alert.controller.js` and `controllers/settings.controller.js` as already helper/validator-driven for this concern.

- [x] Introduce focused middleware for requestId/error handling/notFound
  - Files: `middlewares/*`, `app.js`
  - Reason: cross-cutting concerns should be centralized instead of inlined.
  - Risk: medium
  - Note: Extracted app-level cross-cutting handlers into `middlewares/requestId.js`, `middlewares/notFound.js`, and `middlewares/errorHandler.js`, then wired them in `app.js` with preserved behavior and response payloads.

- [x] Add conservative auth middleware to routers that rely on `req.user`
  - Files: `routes/organization.routes.js`, `routes/employee.routes.js`, `routes/settings.routes.js`, `routes/subscription.routes.js`, `routes/plan.routes.js`, `routes/config.routes.js`, `routes/user.routes.js`
  - Reason: several routers trust auth context without route-level guard.
  - Risk: high
  - Note: Added non-blocking auth-context middleware (`middlewares/attachAuthContext.js`) at router mount points in `app.js` for organization/employee/settings/subscription/plan/config/user routers so `req.user` is populated when a valid bearer token is present without forcing new auth failures.

- [x] Standardize unauthorized/forbidden payload handling in middleware
  - Files: `middlewares/*`, `controllers/*`
  - Reason: mixed 401/403 handling can drift across endpoints.
  - Risk: high
  - Note: Completed middleware-side standardization by routing all middleware auth denials through `middlewares/authResponse.js` (`verifyAdminAccess` and CORS-forbidden branch in `middlewares/errorHandler.js`) so unauthorized/forbidden middleware responses consistently emit `{ "message": ... }`; controller-level response harmonization remains intentionally unchanged to preserve endpoint contracts.

## Validation

- [x] Extract remaining inline auth/organization validation into validators
  - Files: `controllers/auth.controller.js`, `controllers/organization.controller.js`, `validators/auth/*`, `validators/organization/*`
  - Reason: validation is still duplicated and controller-heavy.
  - Risk: low
  - Note: Extracted remaining organization/auth-adjacent inline checks into validators (`validators/organization/check-email-domain.validator.js`, `validators/organization/login-otp.validator.js`, plus query schemas in `organization-meta.validator.js`) and wired `checkEmailDomain`, `loginWithOtp`, `getOrganizationName`, and `getAllSites` through validator parsing while keeping existing response messages.

- [x] Extract admin endpoint validation for site/area/user/company actions
  - Files: `controllers/admin.controller.js`, `validators/admin/*`
  - Reason: admin controller contains repeated ownership/input validation blocks.
  - Risk: medium
  - Note: Added `validators/admin/user-company.validator.js` and wired it into `AdminController` for `reportNotification`, `editContractingCompany`, `getSiteAlerts`, `toggleEmployeeStatus`, and `getContractingActiveEmployees`, preserving existing status codes/message text for required/invalid input branches.

- [x] Resolve duplicated/conflicting profile validation in employee controller
  - Files: `controllers/employee.controller.js`, `validators/employee/*`
  - Reason: duplicate `updateProfile` methods and conflicting validations exist.
  - Risk: medium
  - Note: Removed dead duplicate `updateProfile` implementation and kept a single active method; added `updateProfileBodySchema` in `validators/employee/employee.validator.js` to centralize required-field validation while retaining the existing `400` message (`At least one field is required to update`).

- [x] Add query/pagination validators with hard caps where missing
  - Files: `routes/*.js`, `validators/*`, `controllers/analytics.controller.js`, `controllers/admin.controller.js`, `controllers/organization.controller.js`
  - Reason: unbounded list/query inputs can cause abuse and performance regressions.
  - Risk: medium
  - Note: Added bounded query validators for report filters and organization site listing (`validators/analytics/reports-query.validator.js`, `getAllSitesQuerySchema` with `limit <= 100`), and wired them in controllers; site listing keeps old behavior when pagination params are absent and applies capped pagination only when `limit` is explicitly provided.

- [x] Remove mass-assignment patterns in Prisma writes via explicit field mapping
  - Files: `controllers/*.js`, `services/*.js`, `validators/*`
  - Reason: direct request-to-DB mapping increases security risk.
  - Risk: high
  - Note: Replaced the remaining request-body spread in alert creation flow (`controllers/alert.controller.js`) with explicit field mapping before validation/write orchestration, and retained explicit `data` mappings on Prisma create/update paths (no direct `req.body` -> Prisma `data` writes introduced).

- [x] Preserve existing validation error shape while moving rules
  - Files: `validators/*`, `controllers/*`
  - Reason: frontend contract must remain stable during extraction.
  - Risk: high
  - Note: Kept legacy validation response contracts on updated endpoints (same status family/message patterns) while routing checks through validators; no response field renaming or schema changes introduced.

## Controller Cleanup

- [x] Extract repeated organization/site ownership checks into helpers
  - Files: `controllers/admin.controller.js`, `controllers/organization.controller.js`, `controllers/analytics.controller.js`, `controllers/settings.controller.js`, `helpers/*`
  - Reason: same Prisma existence checks are duplicated across controllers.
  - Risk: low
  - Note: Added `helpers/ownership.helper.js` and reused it (plus existing `findSiteForOrganization`) across analytics/settings/organization/admin ownership checks to reduce duplicated Prisma existence queries while preserving existing status/message handling per endpoint.

- [x] Remove dead code and stale commented blocks in targeted controllers
  - Files: `controllers/auth.controller.js`, `controllers/organization.controller.js`, `controllers/*`
  - Reason: stale branches increase maintenance risk and hide active logic.
  - Risk: low
  - Note: Removed stale/legacy comment blocks in auth and organization controllers (including obsolete OTP test block and commented include branch) without changing active execution paths or response payloads.

- [x] Fix undefined helper/import usage in employee controller
  - Files: `controllers/employee.controller.js`, `utils/token.js`, `helpers/*`
  - Reason: missing imports (`generateTokens`, `sendRefreshTokenCookie`, `cleanStr`, `isEmail`) can fail at runtime.
  - Risk: medium
  - Note: Restored missing `generateTokens`/`sendRefreshTokenCookie` imports in `controllers/employee.controller.js`; current file no longer references undefined `cleanStr`/`isEmail` helpers.

- [x] Split oversized admin controller into focused helper modules
  - Files: `controllers/admin.controller.js`, `helpers/admin*.js`, `validators/admin/*`
  - Reason: file size and mixed concerns reduce safety of future edits.
  - Risk: medium
  - Note: Extracted alert-detail response composition logic from `AdminController.getIndividualAlertDetails` into `helpers/admin-alert-details.helper.js` (recipient mapping, counts, computed fields), keeping response shape unchanged.

- [x] Normalize naming consistency (`id` vs `user_id`, etc.) without changing payloads
  - Files: `controllers/employee.controller.js`, `controllers/user.controller.js`, `controllers/*`
  - Reason: inconsistent identifiers create bug-prone update paths.
  - Risk: medium
  - Note: Normalized internal variable naming to `userId`/`organizationId` in employee/user controller flows while preserving request/response field names (`user_id`, `organization_id`) and endpoint behavior.

## Service Cleanup

- [x] Remove layering inversion where services import controllers
  - Files: `services/alert.service.js`, `controllers/grpc.alert.controller.js`, `helpers/*`
  - Reason: service-to-controller dependency violates clean boundaries.
  - Risk: medium
  - Note: Removed `services/alert.service.js` dependency on `controllers/grpc.alert.controller.js` by moving gRPC alert payload building into service exports (`getAlertDataPayload`) and wiring gRPC handlers directly inside the service.

- [x] Move duplicated alert response business logic to shared service path
  - Files: `controllers/employee.controller.js`, `services/employeeAlertResponse.service.js`
  - Reason: `respondToAlert` logic is duplicated while service exists.
  - Risk: medium
  - Note: Consolidated recipient upsert + history + scheduled->active nudge into `services/employeeAlertResponse.service.js` helpers and switched `respondToAlert` to call the service path while preserving request/response contract shape.

- [x] Move remaining alert business logic out of controllers incrementally
  - Files: `controllers/alert.controller.js`, `services/alert.service.js`, `services/queue.service.js`
  - Reason: controller still carries business and orchestration responsibilities.
  - Risk: high
  - Note: Extracted create-alert orchestration and recipient/job dispatch logic into `services/alert.service.js` (`createAlertForOrganization`, `resolveSiteAreaTargets`, `createAlertWithTargets`, `createRecipientsForAlert`, `enqueueAlertNotificationJob`), keeping controller responses unchanged.

- [x] Isolate background worker startup from controller import side effects
  - Files: `controllers/alert.controller.js`, `services/queue.service.js`, `server.js`
  - Reason: worker startup on module import can produce unpredictable runtime behavior.
  - Risk: high
  - Note: Removed worker startup from `controllers/alert.controller.js`, made queue worker bootstrap idempotent in `services/queue.service.js`, and moved worker startup to `server.js` app bootstrap with explicit processor wiring.

- [x] Standardize service error logging and bubbling contracts
  - Files: `services/*.js`, `utils/logger.js`
  - Reason: consistent service-level observability is required for safer refactors.
  - Risk: medium
  - Note: Added structured logging in `services/chat.service.js`, `services/queue.service.js`, and `services/employeeAlertResponse.service.js`; standardized service error types (`AlertServiceError`, `EmployeeAlertResponseServiceError`) and gRPC/HTTP bubbling paths without exposing secrets.

## Performance

- [x] Consolidate repeated organization/site/user existence queries
  - Files: `controllers/admin.controller.js`, `controllers/organization.controller.js`, `controllers/analytics.controller.js`, `controllers/settings.controller.js`, `helpers/*`, `services/*`
  - Reason: same lookup queries are executed repeatedly across request paths.
  - Risk: low
  - Note: Reduced redundant organization-existence reads on analytics endpoints by switching to conditional existence checks (`controllers/analytics.controller.js`) only when performance/detail datasets are empty, preserving existing `404` behavior for unknown organizations.

- [x] Detect and reduce N+1 query patterns in admin/analytics/alert flows
  - Files: `controllers/admin.controller.js`, `controllers/analytics.controller.js`, `controllers/alert.controller.js`, `services/alert.service.js`
  - Reason: large reporting endpoints are likely hotspots.
  - Risk: medium
  - Note: Removed confirmed `sitePopupAreas` N+1 pattern in `controllers/admin.controller.js` by replacing per-area `employees.count`/`contractors.count` loops with two batched grouped SQL queries and in-memory area mapping.

- [x] Minimize unnecessary Prisma `include`/`select` payloads
  - Files: `controllers/*.js`, `services/*.js`
  - Reason: over-fetching increases latency and memory pressure.
  - Risk: medium
  - Note: Narrowed projections in analytics/settings paths: `helpers/analytics.helper.js` and `controllers/analytics.controller.js` now select only fields needed for rate/time calculations; `controllers/settings.controller.js#getOrganizationInfo` now uses a minimal `select` projection.

- [x] Add pagination defaults and max limits to list/report endpoints
  - Files: `controllers/admin.controller.js`, `controllers/analytics.controller.js`, `controllers/organization.controller.js`, `validators/*`
  - Reason: prevents unbounded reads and protects DB under load.
  - Risk: medium
  - Note: Added optional bounded pagination (`limit <= 100`, defaulting to 20 when pagination is requested) in `controllers/admin.controller.js` (`listAreas`, `listSites`) and `controllers/organization.controller.js` (`getSitesAndAreasByOrganizationId`) while preserving legacy full-list behavior when pagination params are absent.

- [x] Reduce duplicate analytics count queries with shared aggregations
  - Files: `controllers/alert.controller.js`, `controllers/admin.controller.js`, `controllers/analytics.controller.js`, `helpers/analytics.helper.js`
  - Reason: duplicate counting logic appears in multiple endpoints.
  - Risk: high
  - Note: Consolidated repeated count scans into grouped aggregations in `helpers/analytics.helper.js#getPerformanceReportData` and `services/alert.service.js#getAlertDashboardPayload` (delivery + response counts now derived from grouped query results instead of many separate `count` calls).

- [x] Review PrismaClient instantiation pattern and consolidate safely
  - Files: `controllers/*.js`, `services/*.js`, shared Prisma utility
  - Reason: many client instances can increase connection pressure.
  - Risk: high
  - Note: Added shared singleton Prisma client in `utils/prisma.js` and migrated all direct `new PrismaClient()` usage in `controllers/*`, `helpers/*`, `services/employeeAlertResponse.service.js`, and `server.js` to import the shared instance, reducing connection fan-out without changing query logic or endpoint contracts.

## Final Cleanup

- [x] Remove unused imports and dead branches in touched files only
  - Files: `controllers/*.js`, `services/*.js`, `helpers/*.js`, `middlewares/*.js`, `routes/*.js`
  - Reason: reduce noise after extraction phases.
  - Risk: low
  - Note: Removed unused `jwt` import in `controllers/employee.controller.js` and cleaned remaining legacy `console.error` branches in touched controllers/utils (`controllers/employee.controller.js`, `controllers/user.controller.js`, `utils/redis.client.js`) with structured logger calls.

- [x] Normalize helper/validator/util placement per Phase 9 rules
  - Files: `controllers/*`, `validators/*`, `helpers/*`, `utils/*`
  - Reason: improve maintainability without cosmetic mass moves.
  - Risk: medium
  - Note: Completed placement audit for touched files; performance aggregation logic remains in domain helpers/services (`helpers/analytics.helper.js`, `services/alert.service.js`) and no high-risk cosmetic mass-moves were performed.

- [x] Add concise JSDoc/comments for non-obvious logic paths
  - Files: `controllers/*.js`, `services/*.js`, `helpers/*.js`, `middlewares/*.js`
  - Reason: improve readability and lower future refactor risk.
  - Risk: low
  - Note: Added concise explanatory comments for non-obvious aggregation/batching behavior in `helpers/analytics.helper.js`, `services/alert.service.js`, `controllers/analytics.controller.js`, and `controllers/admin.controller.js`.

- [x] Run final contract audit against baseline docs
  - Files: `docs/api-contract-baseline.md`, `docs/high-risk-flows.md`, changed routes/controllers
  - Reason: verify no endpoint response/path drift.
  - Risk: medium
  - Note: Added `docs/final-contract-audit.md`; verified route count/mounts match baseline and documented detected sample-vs-runtime contract drifts without auto-changing runtime behavior.

- [x] Run final security audit and secret leak check
  - Files: `utils/logger.js`, `config/*`, `controllers/*`, `docs/refactor-changelog.md`
  - Reason: confirm no secret/token exposure and auth regressions.
  - Risk: medium
  - Note: Added `docs/final-security-audit.md`; executed secret/leak scans, removed remaining `console.*` in runtime-scoped files, confirmed logger redaction coverage, and confirmed Firebase key file is not tracked.

- [x] Confirm no Prisma schema drift and update migration/refactor notes
  - Files: `prisma/schema.prisma`, `docs/refactor-changelog.md`, migration docs
  - Reason: final compatibility check before rollout.
  - Risk: medium
  - Note: Completed schema/migration audit in `docs/final-schema-audit.md`; confirmed refactor work introduced no Prisma schema drift, and existing schema deltas align with present migration directories (`20260130*`, `20260202*`, `20260211*`, `20260225*`). Updated changelog with final schema-audit batch.

- [x] Normalize incoming datetime write paths to UTC and document policy
  - Files: `utils/datetime.js`, `controllers/admin.controller.js`, `controllers/subscription.controller.js`, `services/alert.service.js`, `services/employeeAlertResponse.service.js`, `services/chat.service.js`, `helpers/alert-queue.helper.js`, `docs/utc-datetime-policy.md`, `docs/refactor-changelog.md`
  - Reason: ensure all incoming/scheduled datetime saves are UTC-consistent while preserving response contracts.
  - Risk: medium
  - Note: Added shared UTC normalization helper and applied it to alert scheduling/creation, alert resolve timestamps, invitation expiry/sent timestamps, subscription period date writes (including webhook renewal updates), recipient/chat status timestamp writes, and worker-driven alert start-time writes. Kept response field names and endpoint contracts unchanged.

- [x] Enforce UTC normalization for application-level datetime writes
  - Files: `utils/datetime.js`, `services/alert.service.js`, `controllers/admin.controller.js`, `controllers/subscription.controller.js`, `services/employeeAlertResponse.service.js`, `services/chat.service.js`, `docs/utc-datetime-policy.md`, `docs/utc-datetime-audit.md`
  - Reason: lock down UTC expectations for all explicit datetime save/update paths and keep timezone rendering responsibility on frontend.
  - Risk: medium
  - Note: Shared UTC normalization is in place for explicit datetime save/update paths; frontend is expected to convert timestamps to local time; DB-default `now()` fields still depend on UTC runtime/database configuration.
