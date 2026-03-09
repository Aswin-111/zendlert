# Codebase Analysis

This document was produced by reading scalecodebase.md and then analyzing app.js, all route files, all controllers, middlewares, validators, and service/helper files.

## 1. Route -> Controller -> Service Dependency Map

| Method | Route | Controller | Service/Dependency Path |
|---|---|---|---|
| GET | /api/v1/admin/alerts/summary | AdminController.getAlertSummaryForOrg | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/alerts/history | AdminController.getAlertHistory | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/alerts/scheduled | AdminController.getScheduledAlerts | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/alerts | AdminController.createAlert | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/alerts/:alertId | AdminController.getIndividualAlertDetails | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/areas/:areaId/alerts | AdminController.getAreaAlerts | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/sites/alerts | AdminController.getSiteAlerts | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/emergency-types | AdminController.listEmergencyTypes | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/notifications/report | AdminController.reportNotification | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/areas | AdminController.listAreas | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/areas | AdminController.createArea | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/areas/:id | AdminController.updateArea | No service layer (direct Prisma + Resend/Firebase in controller) |
| DELETE | /api/v1/admin/areas/:id | AdminController.deleteArea | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/cards | AdminController.getSitesCards | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/search | AdminController.searchSites | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites | AdminController.listSites | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/sites | AdminController.createSite | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/sites/:id | AdminController.updateSite | No service layer (direct Prisma + Resend/Firebase in controller) |
| DELETE | /api/v1/admin/sites/:id | AdminController.deleteSite | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/:siteId/areas | AdminController.listAreasBySite | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/:siteId/overview | AdminController.siteOverview | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/:siteId/popup | AdminController.sitePopupOverview | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/:siteId/popup/areas | AdminController.sitePopupAreas | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/:siteId/popup/employees | AdminController.sitePopupEmployees | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/sites/:siteId/popup/alerts | AdminController.getSitePopupAlerts | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/roles | AdminController.listRoles | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/users | AdminController.createUser | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/users/:userId/deactivate | AdminController.deactivateUser | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/users | AdminController.getEmployees | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/users/:userId | AdminController.employeeDetails | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/users/:userId | AdminController.editEmployee | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/users/:userId/status | AdminController.toggleEmployeeStatus | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/contracting-companies | AdminController.getAllContractingCompanies | No service layer (direct Prisma + Resend/Firebase in controller) |
| POST | /api/v1/admin/contracting-companies | AdminController.createContractingCompany | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/contracting-companies/active-users | AdminController.getContractingCompanies | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/contracting-companies/:companyId | AdminController.editContractingCompany | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/contracting-companies/:companyId/active-users | AdminController.getContractingActiveEmployees | No service layer (direct Prisma + Resend/Firebase in controller) |
| DELETE | /api/v1/admin/contracting-companies/:companyId | AdminController.deleteContractingCompany | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/organization-overview | AdminController.getOrganizationOverview | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/filter-values | AdminController.getFilterValues | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/analytics/card | AdminController.getSiteAnalyticsCard | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/analytics/performance | AdminController.getSitePerformance | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/analytics/alert-distribution | AdminController.getAlertDistribution | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/analytics/response-time-trend | AdminController.getResponseTimeTrend | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/general-settings | AdminController.getGeneralSettings | No service layer (direct Prisma + Resend/Firebase in controller) |
| PUT | /api/v1/admin/general-settings | AdminController.updateGeneralSettings | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/admin/billing-history | AdminController.getBillingHistory | No service layer (direct Prisma + Resend/Firebase in controller) |
| GET | /api/v1/alert/dashboard | AlertController.getDashboardStats | No service layer; controller owns BullMQ queue/worker |
| GET | /api/v1/alert | AlertController.getAlertDashboard | No service layer; controller owns BullMQ queue/worker |
| GET | /api/v1/alert/types | AlertController.getAlertTypes | No service layer; controller owns BullMQ queue/worker |
| GET | /api/v1/alert/sites | AlertController.getSites | No service layer; controller owns BullMQ queue/worker |
| GET | /api/v1/alert/areas | AlertController.getAreas | No service layer; controller owns BullMQ queue/worker |
| POST | /api/v1/alert/recipients/count | AlertController.getRecipientCountsByArea | No service layer; controller owns BullMQ queue/worker |
| POST | /api/v1/alert | AlertController.createAlert | No service layer; controller owns BullMQ queue/worker |
| PUT | /api/v1/alert/:alertId/resolve | AlertController.resolveAlert (via inline middleware) | No service layer; controller owns BullMQ queue/worker |
| GET | /api/v1/analytics/reports | AnalyticsController.getReports | helpers/analytics.helper.js (getOverviewData/getPerformanceData/getDetailsData) |
| GET | /api/v1/analytics/emergency-types/percentages | AnalyticsController.getEmergencyTypePercentages | No service layer (direct Prisma + local helper functions) |
| GET | /api/v1/analytics/channels/performance | AnalyticsController.getPerformanceReport | No service layer (direct Prisma + local helper functions) |
| GET | /api/v1/analytics/details | AnalyticsController.getDetailedStats | No service layer (direct Prisma + local helper functions) |
| POST | /api/v1/config/setfcmtoken | ConfigController.setFcmToken | No service layer (direct Prisma) |
| GET | /api/v1/config/getnotification | ConfigController.getNotification | No service layer (direct Prisma) |
| POST | /api/v1/employee/login | EmployeeController.employeeLogin | No service layer (direct Prisma) |
| POST | /api/v1/employee/respond-to-alert | EmployeeController.respondToAlert | services/employeeAlertResponse.service.js imported but not used; logic duplicated in controller |
| GET | /api/v1/employee/response-history | EmployeeController.getResponseHistory | No service layer (direct Prisma) |
| GET | /api/v1/employee/organization-info | EmployeeController.getOrganizationInfo | No service layer (direct Prisma) |
| GET | /api/v1/employee/recent-notifications | EmployeeController.getRecentNotifications | No service layer (direct Prisma) |
| GET | /api/v1/employee/profile | EmployeeController.getProfile | No service layer (direct Prisma) |
| PUT | /api/v1/employee/profile | EmployeeController.updateProfile | No service layer (direct Prisma) |
| POST | /api/v1/employee/report-visitor | EmployeeController.reportVisitor | No service layer (direct Prisma) |
| PUT | /api/v1/employee/toggle-notification | EmployeeController.toggleEmergencyNotification | No service layer (direct Prisma) |
| GET | /api/v1/organizations/test | (inline test handler) | inline test handler only |
| GET | /api/v1/organizations/check-business-name | OrganizationController.checkBusinessName | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/check-email-domain | OrganizationController.checkEmailDomain | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/refresh | AuthController.handleRefreshToken | utils/token.js (generateTokens) |
| POST | /api/v1/organizations/logout | AuthController.logout | utils/token.js (generateTokens) |
| POST | /api/v1/organizations/send-otp | OrganizationController.sendOtp | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/verify-otp | OrganizationController.verifyOtp | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/login-otp | OrganizationController.loginWithOtp | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/create-organization | OrganizationController.createOrganization | utils/token.js + utils/redis.client.js (no services/* usage) |
| GET | /api/v1/organizations/organization-info | OrganizationController.getOrganizationName | utils/token.js + utils/redis.client.js (no services/* usage) |
| PUT | /api/v1/organizations/update-organization | OrganizationController.updateOrganization | utils/token.js + utils/redis.client.js (no services/* usage) |
| PUT | /api/v1/organizations/profile/update | OrganizationController.updateUserProfile | utils/token.js + utils/redis.client.js (no services/* usage) |
| PUT | /api/v1/organizations/site/update | OrganizationController.updateSite | utils/token.js + utils/redis.client.js (no services/* usage) |
| PUT | /api/v1/organizations/area/update | OrganizationController.updateArea | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/create-site | OrganizationController.createSite | utils/token.js + utils/redis.client.js (no services/* usage) |
| GET | /api/v1/organizations/sites | OrganizationController.getAllSites | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/create-area | OrganizationController.createArea | utils/token.js + utils/redis.client.js (no services/* usage) |
| GET | /api/v1/organizations/check-emaildomain | OrganizationController.checkEmailForEmployee | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/employee-get-otp | OrganizationController.sendOtpForEmployeeSignup | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/employee-verify-otp | OrganizationController.verifyOtpForEmployeeSignup | utils/token.js + utils/redis.client.js (no services/* usage) |
| POST | /api/v1/organizations/create-employee | OrganizationController.createEmployee | utils/token.js + utils/redis.client.js (no services/* usage) |
| GET | /api/v1/organizations/sites-areas | OrganizationController.getSitesAndAreasByOrganizationId | utils/token.js + utils/redis.client.js (no services/* usage) |
| PUT | /api/v1/organizations/assign-site-area | OrganizationController.assignSiteAndAreaToUser | utils/token.js + utils/redis.client.js (no services/* usage) |
| GET | /api/v1/plans | PlansController.getAllPlans | No service layer (direct Prisma) |
| GET | /api/v1/settings/get-organization-info | SettingsController.getOrganizationInfo | No service layer (direct Prisma) |
| GET | /api/v1/settings/get-alert-types | SettingsController.getAlertTypes | No service layer (direct Prisma) |
| POST | /api/v1/settings/alert-type | SettingsController.createAlertType | No service layer (direct Prisma) |
| PUT | /api/v1/settings/alert-type | SettingsController.updateAlertType | No service layer (direct Prisma) |
| DELETE | /api/v1/settings/alert-type | SettingsController.deleteAlertType | No service layer (direct Prisma) |
| POST | /api/v1/settings/create-severity-level | SettingsController.createSeverityLevel | No service layer (direct Prisma) |
| GET | /api/v1/settings/get-all-severity-levels | SettingsController.getAllSeverityLevels | No service layer (direct Prisma) |
| PUT | /api/v1/settings/edit-severity-level | SettingsController.editSeverityLevel | No service layer (direct Prisma) |
| DELETE | /api/v1/settings/delete-severity-level | SettingsController.deleteSeverityLevel | No service layer (direct Prisma) |
| POST | /api/v1/subscriptions/create | SubscriptionController.createSubscription | No internal service layer (direct Prisma + Stripe SDK) |
| POST | /api/v1/subscriptions/preview | SubscriptionController.previewInvoice | No internal service layer (direct Prisma + Stripe SDK) |
| GET | /api/v1/subscriptions/status | SubscriptionController.getSubscriptionStatus | No internal service layer (direct Prisma + Stripe SDK) |
| POST | /api/v1/subscriptions/webhook | SubscriptionController.handleWebhook (via express.raw middleware) | No internal service layer (direct Prisma + Stripe SDK) |
| GET | /api/v1/users/:userId | UserController.getUserById | No service layer (direct Prisma) |
| PUT | /api/v1/users/:userId/public-key | UserController.updateUserPublicKey | No service layer (direct Prisma) |
| POST | /api/v1/users/register-fcm | UserController.registerFcmToken | No service layer (direct Prisma) |
| GET | /api/v1/users/organization/:orgId | UserController.getOrganizationUsers | No service layer (direct Prisma) |

### Service-layer usage summary

- services/* is minimally used by HTTP controllers.
- Direct service usage from HTTP layer is effectively only intended in EmployeeController.respondToAlert, but the imported service is not called and logic is duplicated in-controller (controllers/employee.controller.js:9-12, controllers/employee.controller.js:189).
- Analytics report routing uses helper functions from helpers/analytics.helper.js only for GET /api/v1/analytics/reports (controllers/analytics.controller.js:4-6, controllers/analytics.controller.js:115-121).
- gRPC startup is service-driven (server.js:13-14), but services/alert.service.js imports a controller (controllers/grpc.alert.controller.js), which inverts normal layering (services/alert.service.js:8).

## 2. Middleware Usage Across Routes

### App-level middleware (app.js)

- cors({ origin: "*", credentials: true, methods: [...] }) on all routes (app.js:19-25).
- express.json() and express.urlencoded(...) globally (app.js:28-29).
- express.raw({ type: "application/json" }) at /api/v1/subscriptions/webhook (app.js:37-40).
- Inline request logger middleware only for /api/v1/organizations/* (app.js:45-54).

### Router-level middleware

- verifyAdminAccess protects all routes in:
- routes/admin.routes.js (routes/admin.routes.js:7)
- routes/alert.routes.js (routes/alert.routes.js:6)
- routes/analytics.routes.js (routes/analytics.routes.js:7)

### Route-specific middleware

- PUT /api/v1/alert/:alertId/resolve has inline body mapping middleware before controller (routes/alert.routes.js:15-18).
- POST /api/v1/subscriptions/webhook applies express.raw(...) in-route as well (routes/subscription.routes.js:15-18), duplicating the app-level raw parser setup.

### Routers with no auth middleware

- No route-level auth middleware is applied in organization, employee, settings, subscription, plan, config, or user routers.

## 3. Duplicated Validation Logic Inside Controllers

1. Repeated organization authorization checks (if (!organization_id) return 401) are scattered across many controllers instead of centralized middleware.
- Examples: controllers/alert.controller.js:376-378, controllers/analytics.controller.js:93-95, controllers/admin.controller.js:97-103, controllers/settings.controller.js:20-24.

2. Repeated organization exists validation via prisma.organizations.findUnique is duplicated in multiple endpoints.
- Examples: controllers/analytics.controller.js:103-110, controllers/settings.controller.js:118-120, controllers/settings.controller.js:275-280, controllers/admin.controller.js:105-116.

3. Email shape/domain checks are duplicated manually in OrganizationController rather than extracted to validator modules.
- Examples: controllers/organization.controller.js:62-80, controllers/organization.controller.js:142-151, controllers/organization.controller.js:1011-1019.

4. OTP request/verification validation logic is duplicated for org and employee flows.
- Examples: controllers/organization.controller.js:153-157, controllers/organization.controller.js:337-344, controllers/organization.controller.js:1082-1086.

5. Profile update validation is duplicated and conflicting in EmployeeController with two updateProfile methods; the second one overrides the first.
- controllers/employee.controller.js:625-716 and controllers/employee.controller.js:717-790.

6. Site/area ownership validation repeats in both admin and organization controllers.
- Examples: controllers/admin.controller.js:672-688, controllers/admin.controller.js:2240-2246, controllers/organization.controller.js:754-759, controllers/organization.controller.js:866-873.

## 4. Duplicated Database Queries

1. Organization lookup by organization_id is repeatedly issued across controllers.
- prisma.organizations.findUnique({ where: { organization_id } }) appears in analytics, alert, admin, settings, organization, and employee controllers.
- Examples: controllers/analytics.controller.js:103, controllers/alert.controller.js:464, controllers/admin.controller.js:105, controllers/settings.controller.js:26, controllers/employee.controller.js:413.

2. Site ownership checks (sites.findFirst by id + organization_id) are duplicated heavily, especially in admin.
- Examples: controllers/admin.controller.js:505, controllers/admin.controller.js:2240, controllers/admin.controller.js:2529, controllers/organization.controller.js:754.

3. User lookup by normalized email (users.findUnique({ where: { email: email.toLowerCase() } })) is duplicated in login/signup/profile paths.
- Examples: controllers/organization.controller.js:161, controllers/organization.controller.js:397, controllers/organization.controller.js:1118, controllers/employee.controller.js:133, controllers/admin.controller.js:1884.

4. Refresh-token persistence query (users.update with refresh_token) is duplicated in auth/login flows.
- Examples: controllers/employee.controller.js:151-154, controllers/organization.controller.js:449-452, controllers/organization.controller.js:552-555, controllers/organization.controller.js:1184-1187, controllers/auth.controller.js:62-65.

5. Notification recipient analytics/count queries are duplicated across alert/admin/analytics reporting endpoints.
- Examples: controllers/alert.controller.js:199-272, controllers/admin.controller.js:3097, controllers/analytics.controller.js:12-27.

6. Role list queries are repeated in admin endpoints.
- Examples: controllers/admin.controller.js:554, controllers/admin.controller.js:1664, controllers/admin.controller.js:1786.

## 5. Security Risks

### Critical

1. Firebase service account private key is committed in the repository.
- config/firebase/google-services.json:5.

2. Newly created users in admin flow are written with password_hash: "1234" (not hashed, predictable credential).
- controllers/admin.controller.js:709.

3. OTP is returned to the API client (dev_otp) and can be exposed in responses.
- controllers/organization.controller.js:240-247.

### High

4. Many sensitive routes are not protected by auth middleware, while controllers trust req.user or client-supplied identifiers.
- Route mounts without auth: app.js:43, app.js:56, app.js:59-60, app.js:63-64.
- Example controller trust of req.user: controllers/plan.controller.js:9, controllers/subscription.controller.js:24, controllers/organization.controller.js:751, controllers/employee.controller.js:627.

5. IDOR risk in token/key update endpoints using body/path IDs without auth ownership checks.
- controllers/config.controller.js:10-30 (user_id from body).
- controllers/user.controller.js:58-91 (userId/user_id driven updates).

6. CORS config allows all origins while credentials: true is enabled.
- app.js:20-24.

7. Raw SQL is executed via  (currently static SQL, but unsafe API surface).
- controllers/admin.controller.js:157.

### Medium

8. Password and password hash are logged to stdout during employee creation.
- controllers/organization.controller.js:1160.

9. Hard-coded organization ID in notification endpoint leaks cross-tenant data and bypasses request auth context.
- controllers/config.controller.js:45.

10. No visible rate limiting on login/OTP/auth endpoints.
- Examples: routes/organization.routes.js:13, routes/organization.routes.js:17-19, routes/employee.routes.js:6.

11. Refresh token flow is inconsistent (refresh uses body token, logout expects cookies) and cookie parsing middleware is absent.
- controllers/auth.controller.js:12, controllers/auth.controller.js:147.
- app.js has no cookie-parser middleware.

## 6. Possible Code Smells

1. Extremely large controller files (especially admin.controller.js at ~3927 LOC), with mixed concerns and very high cyclomatic complexity.

2. Weak controller-service boundaries: most business/data access stays in controllers; services/* are underused for HTTP paths.

3. Layering inversion: service importing controller (services/alert.service.js:8).

4. Background worker startup side-effect inside controller module import (controllers/alert.controller.js:25-143 + startNotificationWorker() at line 142).

5. Duplicate method key in object literal (updateProfile) causes silent override.
- controllers/employee.controller.js:625 and controllers/employee.controller.js:717.

6. Missing imports/undefined helpers in employee.controller.
- Uses generateTokens/sendRefreshTokenCookie without import (controllers/employee.controller.js:149, controllers/employee.controller.js:156).
- Uses cleanStr/isEmail without definition (controllers/employee.controller.js:643-657).

7. Inconsistent PK field usage (id vs user_id) in user updates.
- controllers/employee.controller.js:693 vs controllers/employee.controller.js:766.

8. Helper bug risk: helpers/analytics.helper.js uses DeliveryStatus without importing it (helpers/analytics.helper.js:228).

9. Excessive console.log in controllers and startup paths; structured logger usage is inconsistent.
- Examples: controllers/config.controller.js:14-17, controllers/organization.controller.js:797, server.js throughout.

10. Large commented-out blocks and stale code branches increase maintenance cost.
- Examples: controllers/auth.controller.js:79-144, controllers/organization.controller.js:257+.

11. Many request logs use req.requestId, but no request-id middleware exists in app.js.
- Usage: controllers/admin.controller.js:83 (and many other admin methods).

12. Multiple new PrismaClient() instances across many files can increase connection pressure in long-running processes.

## Notes

- This is static analysis only (no runtime tests executed).
- No source code was modified; only this documentation file was created.
