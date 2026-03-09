# Zendlert Backend Refactor Roadmap

## Objective

Refactor and harden the backend **without breaking existing functionality**, **without changing endpoint response shapes**, and **without changing the database schema** in ways that would affect the production app.

This roadmap is designed for a codebase where the `middlewares/` folder currently contains only:

* `middlewares/verifyAdminAccess.js`

That means middleware standardization, validation centralization, and app-level protections should be introduced **carefully and incrementally**.

---

## Non-Negotiable Rules

### Must preserve

* existing endpoint paths
* existing request formats
* existing response JSON structure
* existing response field names
* existing status code behavior unless a bug fix is explicitly approved
* existing database schema and Prisma model contract
* existing auth/business flow unless explicitly targeted

### Must not do

* do not rename routes casually
* do not move many files at once without a tight scope
* do not rewrite controllers and services in the same commit
* do not redesign auth while doing cleanup
* do not introduce new validation error shapes unless the frontend is updated too
* do not change queue / gRPC semantics during general cleanup
* do not bulk-apply “clean architecture” changes without baseline verification

### Refactor principle

Every change must be **behavior-preserving**.

If there is a bug fix, it should be:

* isolated
* documented
* testable
* reviewed against current client expectations

---

## Recommended Execution Strategy

## Which is better?

### Best option: **Phase-by-phase, small scoped changes**

This is much safer than doing everything at once.

### Recommended unit of work

Use one of these scopes:

1. **one infrastructure file at a time** for high-risk files (`app.js`, `server.js`, auth-related code)
2. **one domain at a time** for controller/service/validator cleanup
3. **one phase across a small file set** for mechanical cleanup

### Avoid

* all-files-at-once cleanup
* moving helpers/utils/validators/controllers in one large pass
* mixing security hardening + refactor + optimization in one commit

### Best practical rule

Use this pattern:

* **Phase** = one objective
* **Batch** = 1 to 5 files max
* **Commit** = one coherent behavior-preserving change

Example:

* Phase 1: logging + app hardening
* Batch 1: `app.js`, `server.js`, `utils/logger.js`
* Commit 1: add request id + structured logs
* Commit 2: add startup env validation
* Commit 3: add centralized error handling

---

## Refactor Order Overview

1. Baseline and guardrails
2. App-level hardening
3. Middleware expansion and auth guard audit
4. Validation extraction
5. Controller cleanup
6. Service cleanup
7. Efficiency optimization
8. Scalability improvements
9. File structure cleanup
10. Final audit and documentation

---

# Phase 0 — Baseline and Safety Net

## Goal

Understand current behavior before touching anything.

## Why this comes first

Without a baseline, you cannot prove the refactor preserved behavior.

## Tasks

* inventory all routes from `routes/*.js`
* map each route to controller method
* list high-risk flows:

  * auth
  * organization creation/login
  * admin actions
  * alert creation and alert response
  * subscription / plan flows
* capture current request/response samples for critical endpoints
* identify repeated patterns in controllers
* identify inline validation in controllers
* identify duplicated auth/permission checks
* verify `.env`, `backend.env`, Firebase config handling
* take database backup before any production-impacting rollout

## Deliverables

* `docs/api-contract-baseline.md`
* `docs/high-risk-flows.md`
* `docs/controller-service-map.md`
* `docs/refactor-changelog.md`

## Exit criteria

* route inventory completed
* critical flows documented
* current response shapes captured for important endpoints

---

# Phase 1 — App-Level Hardening

## Goal

Improve global safety and observability without changing business logic.

## Primary files

* `app.js`
* `server.js`
* `utils/logger.js`
* `config/redis-connection.js`
* `utils/redis.client.js`
* `config/firebase.auth.js`

## Tasks

* add structured logging
* add request id / correlation id middleware
* standardize startup logs
* add safe centralized error handler
* add 404 handler if needed
* validate required env vars at startup
* disable unnecessary Express exposure (`x-powered-by`)
* add body size limits
* add safe JSON parsing guards if needed
* add graceful shutdown handling
* add health/readiness endpoint only if it does not conflict with current routes

## Bug-fix scope allowed

* startup crash from missing env can be made explicit
* repeated silent errors can be logged better
* unsafe uncaught errors can be routed through centralized handler

## Must not change

* endpoint response shape for existing endpoints
* controller logic
* authentication behavior

## Exit criteria

* app has centralized logging
* app has centralized error capture
* startup validation exists
* no response contract changed

---

# Phase 2 — Middleware Strategy Expansion

## Current reality

Your `middlewares/` folder currently only contains:

* `verifyAdminAccess.js`

That means middleware concerns are probably scattered elsewhere or embedded in controllers/routes.

## Goal

Introduce a proper middleware strategy **gradually** without changing endpoint behavior.

## Primary files

* `middlewares/verifyAdminAccess.js`
* `app.js`
* route files that use auth/admin checks
* any auth helpers used by controllers

## What to add gradually

Possible future middleware modules:

* `verifyJWT.js`
* `verifyRoles.js`
* `requestId.js`
* `errorHandler.js`
* `notFound.js`
* `rateLimitAuth.js`
* `validateRequest.js`
* `sanitizeInput.js` (only if very conservative)

## Important rule

Do **not** create all middleware and wire everything at once.
Introduce only what is needed in sequence.

## Tasks

* audit `verifyAdminAccess.js`
* document exactly where admin authorization is enforced today
* identify auth checks duplicated inside controllers
* extract only repeated cross-cutting logic into middleware
* add middleware one concern at a time

## Bug-fix scope allowed

* safer null checks
* safer auth header parsing
* clearer unauthorized/forbidden handling while preserving current payload shape
* removal of obvious dead branches

## Must not change

* who can access what, unless there is a documented bug fix
* existing unauthorized response payload contract

## Exit criteria

* middleware responsibilities are documented
* `verifyAdminAccess.js` cleaned and hardened
* new middleware introduced only where safe and justified

---

# Phase 3 — Security Hardening

## Goal

Raise security without changing endpoint contracts.

## Primary files

* `app.js`
* auth-related controllers/helpers
* `middlewares/*`
* `utils/token.js`
* `config/*`

## Tasks

* strict env validation
* CORS whitelist review
* Helmet integration or audit
* request size limits
* auth token parsing audit
* secret handling review
* avoid logging secrets/tokens
* login/auth route rate limiting
* input validation hardening
* prevent mass assignment patterns in controller-to-Prisma writes

## Watch for

* spreading `req.body` directly into Prisma `data`
* inconsistent admin checks
* mixed 401 vs 403 behavior
* token parsing done in multiple places

## Must not change

* token format/payload/expiry unless deliberately planned later
* client-visible auth response shape

## Exit criteria

* auth surface audited
* secret handling documented
* rate limiting added where appropriate
* dangerous mass-assignment patterns identified or removed

---

# Phase 4 — Validation Extraction

## Goal

Move validation rules out of controllers and into `validators/` gradually.

## Why important

This is one of the safest high-ROI refactors if done endpoint by endpoint.

## Existing validator folders

* `validators/admin`
* `validators/auth`
* `validators/organization`
* `validators/subscriptions`

## Suggested expansion

Add only when needed:

* `validators/alert`
* `validators/employee`
* `validators/config`
* `validators/settings`
* `validators/analytics`
* `validators/plan`
* `validators/user`

## Tasks per endpoint

For each endpoint:

1. inspect current inline validation
2. replicate same rules in validator file
3. preserve same validation messages where possible
4. wire validator before business logic
5. confirm response shape stays same
6. only then delete old inline validation

## Best order

1. auth
2. organization
3. admin
4. subscription / plan
5. settings / config
6. employee / user
7. alert / analytics

## Must not change

* existing payload keys
* validation error structure used by frontend

## Exit criteria

* controller validation is reduced
* validators are domain-organized
* no contract drift introduced

---

# Phase 5 — Controller Cleanup

## Goal

Make controllers thin and predictable.

## Primary files

* `controllers/*.js`
* selected route files
* `helpers/*`

## Controller target shape

Controllers should mostly do this:

1. accept request
2. validate / normalize request
3. call service
4. format response
5. handle expected errors

## Controllers should not contain

* long Prisma queries
* repeated auth logic
* large data normalization blocks
* duplicated response helpers
* unrelated utility logic

## Tasks

* extract repeated `try/catch` patterns
* add async wrapper helper if useful
* extract request normalization helpers
* extract common response helpers only if output stays identical
* reduce giant controller methods gradually

## Bug-fix scope allowed

* unreachable branches
* duplicated code bugs
* obvious null access bugs
* copy-paste mistakes in controllers

## Must not change

* response field names
* response nesting
* status codes unless bug is explicitly documented

## Exit criteria

* large controllers shrink safely
* repeated patterns are extracted
* controller logic becomes easier to review

---

# Phase 6 — Service Layer Cleanup

## Goal

Move business logic to service layer where appropriate, but without redesigning architecture.

## Primary files

* `services/alert.service.js`
* `services/chat.service.js`
* `services/employeeAlertResponse.service.js`
* `services/queue.service.js`
* controllers that currently hold business logic

## Tasks

* move repeated business rules from controllers into services
* isolate external side effects
* reduce duplicated DB access logic
* improve service logging and error bubbling
* add idempotency checks where already expected by behavior

## High-risk note

Alert/queue/gRPC-related work is riskier than CRUD cleanup.
Treat this as a later phase.

## Must not change

* queue semantics
* event order assumptions
* external message formats
* alert lifecycle behavior

## Exit criteria

* service responsibilities are clearer
* controller-service boundaries are improved
* no side effect behavior changes introduced accidentally

---

# Phase 7 — Efficiency Optimization

## Goal

Improve performance without changing business output.

## Primary focus areas

* Prisma query optimization
* Redis usage review
* route-level pagination limits
* repeated DB calls
* expensive computations in controllers/services

## Tasks

* review repeated Prisma queries
* minimize `select` / `include` usage to only needed fields
* detect N+1 patterns
* add safe caching for read-heavy endpoints
* add pagination defaults and hard caps
* reduce repeated parsing/transformation work
* avoid duplicate external calls in same request path

## Good candidates

* analytics endpoints
* plan/subscription lookups
* config/settings reads
* organization/admin listing endpoints

## Must not change

* response shape
* ordering behavior unless documented
* current pagination response contract

## Exit criteria

* obvious inefficient query patterns reduced
* read-heavy endpoints reviewed
* safe caching added only where behavior remains consistent

---

# Phase 8 — Scalability and Reliability

## Goal

Make the system more production-ready under load without changing contracts.

## Tasks

* graceful shutdown for server and Redis connections
* queue retry policy audit
* timeout strategy for external integrations
* health checks and readiness checks
* rate limiting on risky endpoints
* statelessness review for horizontal scaling
* ensure logs are deployment-friendly

## Focus areas

* `server.js`
* Redis config/client
* queue service
* alert delivery related services/controllers

## Must not change

* application semantics
* delivery behavior unless intentionally improved and verified

## Exit criteria

* app can fail safer
* app can restart cleaner
* infrastructure behavior is more predictable

---

# Phase 9 — File and Folder Cleanup

## Goal

Clean structure gradually, not cosmetically.

## Rule for moving code

Only move code when the destination is clearly better and the move is behavior-preserving.

## Placement rules

### Put in `validators/`

Anything that validates:

* required fields
* format checks
* enums
* lengths
* ranges
* pagination
* query/body constraints

### Put in `helpers/`

Small reusable logic such as:

* response mappers
* controller helper functions
* normalization helpers
* async wrappers
* pure domain-specific helpers

### Put in `utils/`

Generic reusable utilities such as:

* logger
* token utilities
* redis utility wrappers
* generic date/string helpers
* generic constants

### Keep in `services/`

Anything that does:

* business logic
* Prisma access orchestration
* queue operations
* gRPC interactions
* Redis cache logic

## Must not do

* mass move files in one commit
* rename many imports without isolated testing
* convert everything into helpers/utils just for aesthetics

## Exit criteria

* each move is justified
* imports remain stable
* file organization becomes more obvious over time

---

# Phase 10 — Final Audit

## Goal

Confirm the app is safer, cleaner, and still fully compatible.

## Tasks

* audit all changed files
* compare critical endpoint responses against baseline
* verify auth flows
* verify admin access behavior
* verify organization creation/login/update flows
* verify alert create/respond/list flows
* verify subscription/plan flows
* verify logs are useful and not leaking secrets
* verify no schema changes were introduced
* update migration and refactor docs

## Exit criteria

* no contract drift
* no schema drift
* no unauthorized behavior changes
* roadmap completed and documented

---

# Recommended File-by-File Order

## Batch 1 — infrastructure

1. `app.js`
2. `server.js`
3. `utils/logger.js`
4. `config/redis-connection.js`
5. `utils/redis.client.js`

## Batch 2 — middleware and auth boundary

1. `middlewares/verifyAdminAccess.js`
2. auth-related route/controller helpers
3. future `verifyJWT.js` only if extracted safely
4. future `verifyRoles.js` only if extracted safely

## Batch 3 — auth domain

1. `controllers/auth.controller.js`
2. `validators/auth/*`
3. `utils/token.js`

## Batch 4 — organization/admin

1. `controllers/organization.controller.js`
2. `controllers/admin.controller.js`
3. corresponding routes
4. corresponding validators

## Batch 5 — alert domain

1. `controllers/alert.controller.js`
2. `controllers/grpc.alert.controller.js`
3. `services/alert.service.js`
4. `services/employeeAlertResponse.service.js`
5. `services/queue.service.js`

## Batch 6 — remaining CRUD and read domains

1. `controllers/employee.controller.js`
2. `controllers/user.controller.js`
3. `controllers/settings.controller.js`
4. `controllers/config.controller.js`
5. `controllers/analytics.controller.js`
6. `controllers/plan.controller.js`
7. `controllers/subscription.controller.js`

---

# What to Fix Early vs Later

## Safe to do early

* request logging
* centralized error logging
* env validation
* body size limits
* dead code removal in clearly unused blocks
* unused imports cleanup
* validation extraction
* helper extraction for repeated pure logic
* null-safety improvements
* middleware documentation

## Do later

* queue redesign
* gRPC architecture changes
* Redis key redesign
* large service decomposition
* auth flow redesign
* response format unification
* Prisma relation redesign

---

# Change Management Rules Per Commit

Each commit should satisfy all of these:

* one clear objective
* minimal file scope
* no response contract drift
* no schema changes
* no hidden behavior changes
* readable diff
* reversible if needed

### Good commit examples

* `refactor(app): add centralized request logging and request id`
* `refactor(auth): extract login validation without changing response contract`
* `refactor(admin): clean verifyAdminAccess null checks and logging`
* `perf(org): reduce duplicate prisma reads in organization controller`

### Bad commit examples

* `big cleanup`
* `refactor entire backend`
* `security and optimization fixes`

---

# Codex / Agent Delegation Rules

Use automation/codex-style tools only for **mechanical, behavior-preserving** tasks.

## Safe tasks to delegate

* remove unused imports
* extract inline validators into validator files
* extract pure helper functions
* add JSDoc/comments
* normalize formatting
* replace repeated code with helper wrappers
* small middleware extraction with constraints

## Unsafe tasks to delegate freely

* auth redesign
* service layer redesign
* queue semantics changes
* response contract changes
* Prisma/business rule rewrites

---

# `implement.md` Template

```md
# Task
[Clear task name]

# Objective
Refactor code safely without changing:
- endpoint paths
- request shape
- response JSON structure
- database schema
- existing business behavior

# Scope
[List files allowed to change]

# Hard Constraints
- Do not rename endpoints
- Do not change Prisma schema
- Do not change response fields, nesting, or status codes unless explicitly approved
- Preserve existing imports/exports compatibility where possible
- Keep backward compatibility

# What To Do
[Exact mechanical task]

# What Not To Do
- Do not redesign business logic
- Do not change auth semantics
- Do not rewrite unrelated files
- Do not mass-move files

# Acceptance Criteria
- App still runs
- Existing endpoint behavior preserved
- No schema changes
- No new runtime errors introduced
- Diff is minimal and readable

# Notes
- Prefer extraction over rewriting
- Prefer smaller commits
- Preserve frontend-facing messages where possible
```

---

# Suggested First 10 Tasks

1. create `docs/api-contract-baseline.md`
2. create `docs/controller-service-map.md`
3. audit `middlewares/verifyAdminAccess.js`
4. add structured logging in `utils/logger.js`
5. add request id middleware via `app.js`
6. add centralized Express error handling
7. add startup env validation
8. review auth token handling and secret logging
9. begin validation extraction in `auth.controller.js`
10. begin cleanup of `organization.controller.js` or `admin.controller.js`

---

# Direct Answer: Should you do each file one by one or all at once?

## Recommended

Do it **phase by phase with small file batches**.

### Best working pattern

* infrastructure files together
* one middleware/auth concern at a time
* one domain at a time for controller/service cleanup
* one validator extraction batch at a time

### Do not do

* entire repo cleanup in one shot
* all controller moves at once
* all helper/util/validator folder cleanup at once

## Practical recommendation for your repo

Start with:

1. `app.js`
2. `server.js`
3. `utils/logger.js`
4. `middlewares/verifyAdminAccess.js`

Then move to:
5. `controllers/auth.controller.js`
6. `validators/auth/*`
7. `controllers/organization.controller.js`
8. `controllers/admin.controller.js`

That is the safest route.

---

# Final Principle

The correct refactor is not the fastest one.
The correct refactor is the one where production keeps working exactly the same from the client’s point of view, while the internals become safer, cleaner, and easier to scale.
