# Admin API Migration Guide (So Far)

All new endpoints require:

Authorization: Bearer <access_token>

`organization_id` is now derived from the JWT (`req.user.organization_id`).  
Do **not** send it in query/body anymore.

---

# 1 Organization Alerts Summary

## Old

GET /admin/organization-alerts

Query

- organization_id (required)
- alert_type (optional)

## New

GET /admin/alerts/summary

Query

- q (optional)

Notes

- `organization_id` removed
- `alert_type` → `q`

---

# 2 List Sites

## Old

GET /admin/getallsites

Query

- organization_id (required)

## New

GET /admin/sites

Query

- none

Notes

- organization_id derived from JWT

---

# 3 List Areas (Organization)

## Old

GET /admin/getallareas

Query

- organization_id (required)

## New

GET /admin/areas

Query

- none

Notes

- organization_id derived from JWT

---

# 4 List Areas by Site

## Old

GET /admin/getall-areas

Query

- site_id (required)

GET /admin/getareasbysite

Query

- site_id (required)

## New

GET /admin/sites/:siteId/areas

Path Params

- siteId (required)

Notes

- query param `site_id` → path param `:siteId`

---

# 5 Site Alerts (Building Alerts)

## Old

POST /admin/getall-building-alerts

Body

- building_name (required)

## New

POST /admin/sites/alerts

Body

- building_name (required)

Notes

- functionality unchanged
- organization automatically scoped from JWT

---

# 6 Area Alerts

## Old

POST /admin/building-alerts

Body

- building_name (required)

## New

GET /admin/areas/:areaId/alerts

Path Params

- areaId (required)

Notes

- switched from area name → areaId

---

# 7 List Roles

## Old

GET /admin/getall-roles

Query

- none

## New

GET /admin/roles

Query

- none

Notes

- endpoint now protected by JWT

## Create User (Add Employee/Contractor) Endpoint Migration

### Old

POST /admin/add-employee

Body (JSON)

- organization_id (required)
- site_id (optional/required by your UI)
- area_id (optional/required by your UI)
- first_name (required)
- last_name (required)
- email (required)
- phone_number (optional)
- admin_access (optional boolean)
- is_employee (required boolean)
- contracting_company_id (required if is_employee=false)

Auth

- (not guaranteed) / inconsistent

---

### New

POST /admin/users

Body (JSON)

- site_id (optional)
- area_id (optional)
- first_name (required)
- last_name (required)
- email (required)
- phone_number (optional)
- admin_access (optional boolean)
- is_employee (required boolean)
- contracting_company_id (required if is_employee=false)

Auth

- Authorization: Bearer <access_token>

Derived from token

- organization_id (always taken from JWT; ignore any organization_id sent by client)

Response (unchanged)

- message
- user { id, name, email, role, user_type }

---

### Notes

- Remove `organization_id` from request body (now JWT-scoped).
- Behavior unchanged: still creates employee/contractor + invitation + attempts email send.

## Deactivate Employee Endpoint Migration

### Old Endpoint

PUT /admin/deactivate-employee

Body (JSON)

- user_id (required)

Authentication

- not guaranteed

Response
{
message: "User deactivated successfully"
}

---

### New Endpoint

PUT /admin/users/:userId/deactivate

Path Params

- userId (required)

Query

- none

Authentication
Authorization: Bearer <access_token>

Derived from Token

- organization_id (used to ensure the user belongs to the same organization)

Response (unchanged)
{
message: "User deactivated successfully"
}

---

### Migration Notes

- Move `user_id` from body → path param `:userId`
- Endpoint now protected by `requireAccessToken`
- Deactivation now ensures the user belongs to the authenticated organization

## Emergency Types Endpoint Migration

### Old Endpoint

GET /admin/alerts

Query

- none

Authentication

- not guaranteed

Response
{
alerts: EmergencyType[]
}

---

### New Endpoint

GET /admin/emergency-types

Query

- none

Authentication
Authorization: Bearer <access_token>

Derived from Token

- organization_id

Response (unchanged)
{
alerts: EmergencyType[]
}

---

### Migration Notes

- Endpoint renamed because it returns **emergency types**, not alerts
- Results are now scoped to the authenticated organization
- Response format remains `{ alerts }` to avoid breaking frontend

## Create Alert Endpoint Migration

### Old

POST /admin/alerts

Body (JSON)

- user_id (required UUID)
- organization_id (required UUID)
- emergency_type_id (required UUID)
- message (required)
- start_time (required ISO string)
- end_time (required ISO string)

Auth

- not guaranteed / inconsistent

---

### New

POST /admin/alerts

Body (JSON)

- emergency_type_id (required UUID)
- message (required)
- start_time (required ISO string)
- end_time (required ISO string)

Auth

- Authorization: Bearer <access_token>

Derived from token

- user_id (alert creator)
- organization_id (scope)

Notes

- Remove `user_id` and `organization_id` from request body (JWT-scoped).
- `emergency_type_id` must belong to the authenticated organization.
- API now returns 201 + `{ message, alert_id }` on success.

## Old

POST /report-notification  
body:
{
"user_id": "UUID"
}

## New

POST /notifications/report  
body:
{
"user_id": "UUID"
}

Notes

- Endpoint renamed to follow REST naming.
- Organization is now inferred from `req.user.organization_id`.
- No behavior or response structure changed.

## Old

GET /getall-contractingcompanies  
query:
{
"organization_id": "UUID"
}

## New

GET /contracting-companies

Notes

- `organization_id` is no longer read from query.
- Organization is inferred from `req.user.organization_id`.
- Response structure remains unchanged.

## Old

GET /get-contractingcompanies
query:
{
  "organization_id": "UUID"
}

## New

GET /contracting-companies/active-users

Notes

- `organization_id` is no longer read from query.
- Organization is inferred from `req.user.organization_id`.
- Response structure remains unchanged (still returns `contracting_companies` with `active_user_count`).

---

# Create Contracting Company

## Old

POST /contracting-companies
body: { organization_id, name, address, contact_email, phone }

## New

POST /contracting-companies
body: { name, address, contact_email, phone }

Notes

- `organization_id` removed from body; derived from JWT.

---

# Get Contracting Company Active Users

## Old

GET /get-contractingactiveemployees
query: { organization_id, company_id }

## New

GET /contracting-companies/:companyId/active-users

Notes

- `organization_id` derived from JWT.
- `company_id` moved to path param `:companyId`.

---

# Delete Contracting Company

## Old

DELETE /delete-contractingcompany
body: { organization_id, company_id }

## New

DELETE /contracting-companies/:companyId

Notes

- `organization_id` derived from JWT.
- `company_id` moved to path param `:companyId`.

---

# Organization Overview

## Old

GET /organization-overview
query: { organization_id }

## New

GET /organization-overview

Notes

- `organization_id` derived from JWT.

---

# Filter Values

## Old

GET /get-filtervalues
query: { organization_id }

## New

GET /filter-values

Notes

- `organization_id` derived from JWT.

---

# List / Search Employees

## Old

GET /get-employees
query: { organization_id, search, status, roles, sites, page, limit }

## New

GET /users
query: { search, status, roles, sites, page, limit }

Notes

- `organization_id` derived from JWT.

---

# Employee Details

## Old

GET /get-employeedetails
query: { user_id }

## New

GET /users/:userId

Notes

- `user_id` moved to path param `:userId`.
- Query now scoped to authenticated organization.

---

# Edit Employee

## Old

PUT /edit-employee
body: { user_id, organization_id, first_name, last_name, email, phone, role_id, site_id, area_id, user_type, company_id }

## New

PUT /users/:userId
body: { first_name, last_name, email, phone, role_id, site_id, area_id, user_type, company_id }

Notes

- `user_id` moved to path param `:userId`.
- `organization_id` derived from JWT.

---

# Toggle Employee Status

## Old

PUT /toggle-employeestatus
body: { user_id, organization_id, status }

## New

PUT /users/:userId/status
body: { status }

Notes

- `user_id` moved to path param `:userId`.
- `organization_id` derived from JWT.

---

# Sites Cards

## Old

GET /get-sites-cards
query: { organization_id }

## New

GET /sites/cards

Notes

- `organization_id` derived from JWT.

---

# Search Sites

## Old

GET /search-sites
query: { organization_id, name, status, page, page_size }

## New

GET /sites/search
query: { name, status, page, page_size }

Notes

- `organization_id` derived from JWT.

---

# Create Site

## Old

POST /sites
body: { organization_id, site_name, address, ... }

## New

POST /sites
body: { site_name, address, ... }

Notes

- `organization_id` removed from body; derived from JWT.

---

# Update / Delete Site

## Old

PUT /sites/:id — no org ownership check
DELETE /sites/:id — no org ownership check

## New

PUT /sites/:id — org ownership enforced via JWT
DELETE /sites/:id — org ownership enforced via JWT

Notes

- Site must belong to the authenticated organization.

---

# Create / Update / Delete Area

## Old

POST /areas — no org ownership check
PUT /areas/:id — no org ownership check
DELETE /areas/:id — no org ownership check

## New

POST /areas — site must belong to authenticated org
PUT /areas/:id — area must belong to authenticated org
DELETE /areas/:id — area must belong to authenticated org

Notes

- Organization ownership enforced via JWT.

---

# Site Overview

## Old

POST /sites-overview
query: { site_id }

## New

GET /sites/:siteId/overview

Notes

- Method changed POST → GET.
- `site_id` moved to path param `:siteId`.
- Org ownership enforced via JWT.

---

# Site Popup Overview

## Old

DELETE /sites-popup-overview
query: { site_id }

## New

GET /sites/:siteId/popup

Notes

- Method corrected DELETE → GET.
- `site_id` moved to path param `:siteId`.
- Org ownership enforced via JWT.

---

# Site Popup Areas

## Old

GET /sites/popup-areas
query: { site_id }

## New

GET /sites/:siteId/popup/areas

Notes

- `site_id` moved to path param `:siteId`.
- Org ownership enforced via JWT.

---

# Site Popup Employees

## Old

GET /sites/popup-employees
query: { site_id }

## New

GET /sites/:siteId/popup/employees

Notes

- `site_id` moved to path param `:siteId`.
- Org ownership enforced via JWT.

---

# Site Popup Alerts

## Old

GET /sites-popup-alerts
query: { site_id }

## New

GET /sites/:siteId/popup/alerts

Notes

- `site_id` moved to path param `:siteId`.
- Org ownership enforced via JWT.

---

# Alert History

## Old

GET /alert-history
query: { organization_id, page, per_page }

## New

GET /alerts/history
query: { page, per_page }

Notes

- `organization_id` derived from JWT.

---

# Scheduled Alerts

## Old

GET /scheduled-alerts
query: { organization_id }

## New

GET /alerts/scheduled

Notes

- `organization_id` derived from JWT.

---

# Analytics Card

## Old

GET /get-site-analytics-card
query: { organization_id }

## New

GET /analytics/card

Notes

- `organization_id` derived from JWT.

---

# Site Performance

## Old

GET /get-site-performance
query: { organization_id, page, page_size }

## New

GET /analytics/performance
query: { page, page_size }

Notes

- `organization_id` derived from JWT.

---

# Alert Distribution

## Old

GET /get-alert-distribution
query: { organization_id }

## New

GET /analytics/alert-distribution

Notes

- `organization_id` derived from JWT.

---

# Response Time Trend

## Old

GET /get-response-time-trend
query: { organization_id }

## New

GET /analytics/response-time-trend

Notes

- `organization_id` derived from JWT.

---

# Individual Alert Details

## Old

GET /get-individual-alert
query: { alert_id, organization_id }

## New

GET /alerts/:alertId

Notes

- `alert_id` moved to path param `:alertId`.
- `organization_id` derived from JWT.

---

# General Settings / Billing History

## Old

GET /general-settings — accepted `organization_id` from query as fallback
PUT /general-settings — accepted `organization_id` from body as fallback
GET /billing-history — accepted `organization_id` from query as fallback

## New

GET /general-settings
PUT /general-settings
GET /billing-history

Notes

- `organization_id` strictly derived from JWT only.
- `verifyJWT` middleware removed (redundant; `requireAccessToken` covers all routes).

---

# Alert Routes Migration

## Old

GET /api/v1/alert/get-dashboard
query: { organization_id }

## New

GET /api/v1/alert/dashboard
query: {}

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.

## Old

GET /api/v1/alert/get-alertdashboard
query: { organization_id, filter, page }

## New

GET /api/v1/alert/
query: { filter, page }

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.

## Old

GET /api/v1/alert/get-alerttypes
query: { organization_id }

## New

GET /api/v1/alert/types
query: {}

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.

## Old

GET /api/v1/alert/get-sites
query: { organization_id }

## New

GET /api/v1/alert/sites
query: {}

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.

## Old

GET /api/v1/alert/get-areas
query: { organization_id, site_id }

## New

GET /api/v1/alert/areas
query: { site_id }

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.

## Old

POST /api/v1/alert/get-recipients
body: { organization_id, area_ids }

## New

POST /api/v1/alert/recipients/count
body: { area_ids }

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.

## Old

POST /api/v1/alert/create-alert
body: { user_id, organization_id, ... }

## New

POST /api/v1/alert/
body: { ... }

Notes

- Route protected by `verifyAdminAccess`.
- `user_id` and `organization_id` derived from JWT.

## Old

PUT /api/v1/alert/resolve-alert
body: { organization_id, alert_id, message }

## New

PUT /api/v1/alert/:alertId/resolve
body: { message }

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.
- `alert_id` moved to path param.

---

# Analytics Routes Migration

## Old

GET /api/v1/analytics/overview/get-reports
query: { organization_id, filter }

## New

GET /api/v1/analytics/reports
query: { filter }

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.
- Logic consolidated into `controllers/analytics.controller.js`.

## Old

GET /api/v1/analytics/overview/emergency-type-percentages
query: { organization_id }

## New

GET /api/v1/analytics/emergency-types/percentages
query: {}

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.
- Logic consolidated into `controllers/analytics.controller.js`.

## Old

GET /api/v1/analytics/channel-performance
query: { organization_id }

## New

GET /api/v1/analytics/channels/performance
query: {}

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.
- Logic consolidated into `controllers/analytics.controller.js`.

## Old

GET /api/v1/analytics/detailed
query: { organization_id }

## New

GET /api/v1/analytics/details
query: {}

Notes

- Route protected by `verifyAdminAccess`.
- `organization_id` derived from JWT.
- Logic consolidated into `controllers/analytics.controller.js`.

---

# Employee + Auth Routes Migration

## Old

POST /api/v1/employee/login
body: { email, password }

## New

POST /api/v1/auth/login
body: { email, password }

Notes

- Employee login moved out of employee resource routes into dedicated auth routes.
- Response structure remains unchanged.

## Old

POST /api/v1/employee/respond-to-alert
body: { alert_id, user_id, response, latitude, longitude, location_name? }

## New

POST /api/v1/employees/alerts/:alertId/responses
path: { alertId }
body: { response, latitude, longitude, location_name? }

Notes

- Endpoint renamed to resource-based alert response route.
- `alert_id` is now path-based.
- `user_id` is derived from JWT context.

## Old

GET /api/v1/employee/response-history
query: { limit? }

## New

GET /api/v1/employees/alerts/responses/history
query: { limit? }

Notes

- Endpoint renamed to reflect alert response history resource.
- Route protected by `verifyEmployeeAccess`.

## Old

GET /api/v1/employee/organization-info

## New

GET /api/v1/employees/organization

Notes

- Endpoint renamed to resource-based organization info route.
- Route protected by `verifyEmployeeAccess`.

## Old

GET /api/v1/employee/recent-notifications
query: { limit? }

## New

GET /api/v1/employees/notifications/recent
query: { limit? }

Notes

- Endpoint renamed to resource-based notification route.
- Route protected by `verifyEmployeeAccess`.

## Old

GET /api/v1/employee/profile
PUT /api/v1/employee/profile

## New

GET /api/v1/employees/profile
PUT /api/v1/employees/profile

Notes

- Base resource path moved from singular `employee` to plural `employees`.
- Route protected by `verifyEmployeeAccess`.

## Old

POST /api/v1/employee/report-visitor
body: { alert_id, first_name, last_name?, contact_number?, company_name, location, visiting_purpose? }

## New

POST /api/v1/employees/visitors/reports
body: { alert_id, first_name, last_name?, contact_number?, company_name, location, visiting_purpose? }

Notes

- Endpoint renamed to resource-based visitor reporting route.
- Route protected by `verifyEmployeeAccess`.

## Old

PUT /api/v1/employee/toggle-notification
body: { enabled? }

## New

PATCH /api/v1/employees/notifications/emergency-preference
body: { enabled? }

Notes

- Endpoint renamed to resource-based notification preference route.
- Method changed from `PUT` to `PATCH` for partial preference updates.
- Route protected by `verifyEmployeeAccess`.

---

# Organization + Auth Route Migration (Admin Protected)

## Old

POST /api/v1/auth/login
body: { email, password }

## New

POST /api/v1/auth/sessions/password
body: { email, password }

Notes

- Password login moved to session-based auth naming.

## Old

POST /api/v1/organizations/send-otp
body: { email, purpose }

## New

POST /api/v1/auth/otp/requests
body: { email, purpose }

Notes

- Auth OTP endpoints moved out of `organizations` routes into `auth` routes.

## Old

POST /api/v1/organizations/verify-otp
body: { email, otp, purpose }

## New

POST /api/v1/auth/otp/verifications
body: { email, otp, purpose }

Notes

- Endpoint renamed to OTP verification resource route.

## Old

POST /api/v1/organizations/login-otp
body: { email, otp }

## New

POST /api/v1/auth/sessions/otp
body: { email, otp }

Notes

- OTP login moved into session auth route.

## Old

POST /api/v1/organizations/refresh
body: { refreshToken }

## New

POST /api/v1/auth/tokens/refresh
body: { refreshToken }

Notes

- Token refresh moved to token resource route.

## Old

POST /api/v1/organizations/logout
cookie: jwt

## New

POST /api/v1/auth/sessions/logout
cookie: jwt

Notes

- Logout moved into session auth route.

## Old

GET /api/v1/organizations/check-business-name
query: { business_name }

## New

GET /api/v1/auth/organizations/availability/business-name
query: { business_name }

Notes

- Business-name availability check moved to auth onboarding route.

## Old

POST /api/v1/organizations/check-email-domain
body: { email or domain }

## New

POST /api/v1/auth/organizations/availability/email-domain
body: { email or domain }

Notes

- Organization domain-availability check moved to auth onboarding route.

## Old

POST /api/v1/organizations/create-organization
body: { full_name, email, organization_name, ... }

## New

POST /api/v1/auth/organizations/registrations
body: { full_name, email, organization_name, ... }

Notes

- Organization signup moved to auth registration route.

## Old

GET /api/v1/organizations/check-emaildomain
query: { domain }

## New

GET /api/v1/auth/employees/availability/email-domain
query: { domain }

Notes

- Employee domain validation moved to auth onboarding route.

## Old

POST /api/v1/organizations/employee-get-otp
body: { email }

## New

POST /api/v1/auth/employees/otp/requests
body: { email }

Notes

- Employee OTP request moved to auth route.

## Old

POST /api/v1/organizations/employee-verify-otp
body: { email, otp }

## New

POST /api/v1/auth/employees/otp/verifications
body: { email, otp }

Notes

- Employee OTP verification moved to auth route.

## Old

POST /api/v1/organizations/create-employee
body: { full_name, email, phone, password, domain }

## New

POST /api/v1/auth/employees/registrations
body: { full_name, email, phone, password, domain }

Notes

- Employee signup moved to auth registration route.

## Old

GET /api/v1/organizations/organization-info
query: { user_id }

## New

GET /api/v1/organizations/details
query: {}

Notes

- Organization details endpoint renamed to resource-based path.
- `user_id` is now derived from JWT context.

## Old

PUT /api/v1/organizations/update-organization
body: { organization_id, ...fields }

## New

PUT /api/v1/organizations/details
body: { ...fields }

Notes

- Organization update endpoint renamed to resource-based path.
- `organization_id` is now derived from JWT context.

## Old

PUT /api/v1/organizations/profile/update
body: { first_name?, last_name?, phone_number?, email? }

## New

PUT /api/v1/organizations/users/profile
body: { first_name?, last_name?, phone_number?, email? }

Notes

- User profile update endpoint renamed to nested user resource path.

## Old

POST /api/v1/organizations/create-site
body: { organization_id, ...siteFields }

## New

POST /api/v1/organizations/sites
body: { ...siteFields }

Notes

- Site creation endpoint aligned with resource collection naming.
- `organization_id` is now derived from JWT context.

## Old

PUT /api/v1/organizations/site/update
body: { site_id, ...siteFields }

## New

PUT /api/v1/organizations/sites/:siteId
path: { siteId }
body: { ...siteFields }

Notes

- `site_id` moved from body to path param.

## Old

POST /api/v1/organizations/create-area
body: { site_id, name, description? }

## New

POST /api/v1/organizations/areas
body: { site_id, name, description? }

Notes

- Area creation endpoint aligned with resource collection naming.

## Old

PUT /api/v1/organizations/area/update
body: { area_id, ...areaFields }

## New

PUT /api/v1/organizations/areas/:areaId
path: { areaId }
body: { ...areaFields }

Notes

- `area_id` moved from body to path param.

## Old

GET /api/v1/organizations/sites-areas
query: { organization_id, page?, limit? }

## New

GET /api/v1/organizations/sites/areas
query: { page?, limit? }

Notes

- Endpoint renamed to nested sites/areas resource path.
- `organization_id` is now derived from JWT context.

## Old

PUT /api/v1/organizations/assign-site-area
body: { user_id, site_id, area_id }

## New

PUT /api/v1/organizations/users/:userId/site-area
path: { userId }
body: { site_id, area_id }

Notes

- `user_id` moved from body to path param.

## Old

All `/api/v1/organizations/*` routes were mixed protection/public.

## New

All `/api/v1/organizations/*` routes now use `verifyAdminAccess`.

Notes

- Organization management routes are admin-protected at router level.

---

# Settings Routes Migration (Admin Protected)

## Old

GET /api/v1/settings/get-organization-info
query: { organization_id }

## New

GET /api/v1/settings/organization
query: {}

Notes

- Endpoint renamed to resource-based organization settings route.
- `organization_id` is now derived from JWT context.

## Old

GET /api/v1/settings/get-alert-types
query: { organization_id, page?, limit? }

## New

GET /api/v1/settings/alert-types
query: { page?, limit? }

Notes

- Endpoint renamed to resource-based alert types collection.
- `organization_id` is now derived from JWT context.

## Old

POST /api/v1/settings/alert-type
body: { organization_id, name, description? }

## New

POST /api/v1/settings/alert-types
body: { name, description? }

Notes

- Endpoint renamed to resource-based alert types collection.
- `organization_id` is now derived from JWT context.

## Old

PUT /api/v1/settings/alert-type
query: { organization_id, alert_type_id }
body: { name?, description? }

## New

PUT /api/v1/settings/alert-types/:alertTypeId
path: { alertTypeId }
body: { name?, description? }

Notes

- `alert_type_id` moved from query to path param.
- `organization_id` is now derived from JWT context.

## Old

DELETE /api/v1/settings/alert-type
query: { organization_id, alert_type_id }

## New

DELETE /api/v1/settings/alert-types/:alertTypeId
path: { alertTypeId }

Notes

- `alert_type_id` moved from query to path param.
- `organization_id` is now derived from JWT context.

## Old

POST /api/v1/settings/create-severity-level
body: { organization_id, severity_name, description? }

## New

POST /api/v1/settings/severity-levels
body: { severity_name, description? }

Notes

- Endpoint renamed to resource-based severity levels collection.
- `organization_id` is now derived from JWT context.

## Old

GET /api/v1/settings/get-all-severity-levels
query: { organization_id, page?, limit? }

## New

GET /api/v1/settings/severity-levels
query: { page?, limit? }

Notes

- Endpoint renamed to resource-based severity levels collection.
- `organization_id` is now derived from JWT context.

## Old

PUT /api/v1/settings/edit-severity-level
body: { organization_id, id, severity_name?, description? }

## New

PUT /api/v1/settings/severity-levels/:severityLevelId
path: { severityLevelId }
body: { severity_name?, description? }

Notes

- `id` moved from body to path param.
- `organization_id` is now derived from JWT context.

## Old

DELETE /api/v1/settings/delete-severity-level
query: { organization_id, id }

## New

DELETE /api/v1/settings/severity-levels/:severityLevelId
path: { severityLevelId }

Notes

- `id` moved from query to path param.
- `organization_id` is now derived from JWT context.

## Old

Settings routes were not uniformly admin-protected.

## New

All `/api/v1/settings/*` routes now use `verifyAdminAccess`.

Notes

- Router-level admin protection added via `router.use(verifyAdminAccess)`.

