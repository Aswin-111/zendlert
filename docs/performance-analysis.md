# Performance Analysis (Phase 7)

Date: 2026-03-07  
Scope reviewed: `controllers/*`, `services/*`, `helpers/*` (Prisma call sites)

## 1) Prisma Query Analysis

### Inventory summary
- Total Prisma query call sites found: `287`
- Top files by query density:
  - `controllers/admin.controller.js`: `115`
  - `services/alert.service.js`: `41`
  - `controllers/organization.controller.js`: `35`
  - `controllers/settings.controller.js`: `21`
  - `controllers/employee.controller.js`: `18`
- Query type distribution:
  - `findMany`: `76`
  - `findFirst`: `56`
  - `findUnique`: `48`
  - `count`: `40`
  - `update`: `37`

### Hotspots
- `controllers/admin.controller.js` has the largest concentration of read-heavy and list-heavy endpoints.
- Analytics paths are compute-heavy and frequently load full recipient arrays:
  - `helpers/analytics.helper.js:147`, `helpers/analytics.helper.js:151`, `helpers/analytics.helper.js:275`
  - `controllers/analytics.controller.js:156`
- Alert dashboard paths rely on many separate counts/grouped reads:
  - `services/alert.service.js:286-348`, `services/alert.service.js:390-415`

## 2) N+1 Query Detection

### Confirmed N+1 patterns
1. `controllers/admin.controller.js:2631-2640` (`sitePopupAreas`)
   - Pattern: loop over `site.Areas`, then per area executes:
     - `prisma.employees.count(...)`
     - `prisma.contractors.count(...)`
   - Effect: `2 * N` database queries for `N` areas.
   - Impact: endpoint latency scales linearly with area count.

2. `controllers/admin.controller.js:1002-1031` (`createAlert`)
   - Pattern: per recipient token loop performs per-user writes:
     - `notification_Recipients.create(...)`
     - optional `users.update(...)` for invalid tokens
   - Effect: DB write amplification per user.
   - Note: this is partly coupled to external FCM send behavior; optimization must preserve delivery semantics.

## 3) Unnecessary `select` / `include` Review

### Over-fetch risks
1. `controllers/settings.controller.js:37-42`
   - Uses `findUnique(... include: industry_type ...)` and fetches full organization row.
   - Response uses only a few fields.
   - Recommendation: convert to strict `select` projection for only returned fields.

2. `helpers/analytics.helper.js:147-156`, `helpers/analytics.helper.js:275-280`
   - Uses `include: { Notification_Recipients: true }`.
   - Downstream logic only needs a subset (`delivery_status`, `response`, `acknowledged_at`, `delivered_at`).
   - Recommendation: narrow nested selection to required columns.

3. `controllers/analytics.controller.js:156-162`
   - Loads full `Notification_Recipients` objects for all alerts in organization.
   - Recommendation: narrow nested selection and add bounded query window/pagination.

4. `controllers/admin.controller.js:433-436` (`listSites`)
   - Returns full site rows unpaginated.
   - If full payload is not required by contract, use explicit `select`.

## 4) Pagination Safety Limits

### Endpoints with missing or weak paging controls
1. `controllers/admin.controller.js:384-389` (`listAreas`)
   - Unbounded `findMany`.
2. `controllers/admin.controller.js:433-436` (`listSites`)
   - Unbounded `findMany`.
3. `controllers/admin.controller.js:1445-1467` (`getAllEmployees`)
   - Unbounded employee listing.
4. `controllers/organization.controller.js:778-790` (`getAllSites`)
   - Unbounded list.
5. `controllers/organization.controller.js:1045-1049` (`getSitesAndAreasByOrganizationId`)
   - Unbounded list with `include: { Areas: true }`.
6. `controllers/analytics.controller.js:156-162` and `helpers/analytics.helper.js:275-280`
   - No paging/time window cap for potentially large historical analytics reads.

### Existing good pagination controls
- `controllers/admin.controller.js:1719-1722`, `2030-2032`, `2806-2808`, `3028-3029` cap page size at `100`.
- `validators/settings/settings.validator.js:9-10` caps `limit <= 100`.
- `validators/employee/employee.validator.js:31-32` caps `limit <= 100`.
- `controllers/alert.controller.js:31-32` uses fixed `limit = 5` for dashboard alerts.

## 5) Duplicate Query Detection

### Duplicate/overlapping query families in same request flow
1. `services/alert.service.js:286-348` (`getAlertDashboardPayload`)
   - Multiple separate reads on same organization/recipient domain:
     - several `count(...)`
     - multiple response-status counts
     - separate grouped delivery status query
   - Optimization path: consolidate status counts via grouped query or single raw aggregate query.

2. `controllers/admin.controller.js:283-315` (`getAreaAlerts`)
   - Executes three alert queries (`recent`, `upcoming`, `scheduled`) with overlapping conditions against same dataset.
   - Optimization path: one fetch + in-memory partition (or one query with status bucketing).

3. `helpers/analytics.helper.js:60-82` (`getPerformanceReportData`)
   - Per channel (`sms`, `in_app`, `push`) executes:
     - one count for total
     - one count for delivered
     - one `findMany` for response time
   - Effect: repeated scans with same predicates except `channel`.
   - Optimization path: grouped aggregation by `channel`.

4. Repeated organization existence checks before org-scoped reads/writes:
   - examples in `controllers/settings.controller.js` and `controllers/analytics.controller.js`.
   - Not always wrong, but often redundant for performance if downstream query already enforces org scope.

## Prioritized Optimization Order (No Contract Changes)

1. Fix confirmed N+1 in `sitePopupAreas` (`controllers/admin.controller.js:2631-2640`) using grouped area counts.
2. Add pagination and hard caps to unbounded list endpoints (`admin` and `organization` list APIs).
3. Reduce over-fetch in analytics helpers/controllers by narrowing nested `select`.
4. Consolidate duplicate alert/recipient counts in `services/alert.service.js:getAlertDashboardPayload`.
5. Consolidate channel-based analytics scans in `helpers/analytics.helper.js:getPerformanceReportData`.

## Notes
- This is static analysis only (no runtime benchmarks executed).
- Recommendations are designed to preserve response shape and business behavior.
