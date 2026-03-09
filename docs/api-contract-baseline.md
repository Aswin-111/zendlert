# API Contract Baseline

Snapshot date: 2026-03-07

This document freezes the current route inventory and route-to-controller mapping before additional refactors.

## Baseline Guardrails

- Do not change endpoint paths.
- Do not change request formats.
- Do not change response JSON shape, field names, or status behavior unless explicitly approved.
- Do not change auth/business behavior unless explicitly targeted and documented.
- Do not change Prisma schema/model contract in refactor phases.

## Mounted Route Prefixes (from app.js)

- `/api/v1/config` -> `routes/config.routes.js`
- `/api/v1/organizations` -> `routes/organization.routes.js`
- `/api/v1/users` -> `routes/user.routes.js`
- `/api/v1/admin` -> `routes/admin.routes.js`
- `/api/v1/alert` -> `routes/alert.routes.js`
- `/api/v1/employee` -> `routes/employee.routes.js`
- `/api/v1/settings` -> `routes/settings.routes.js`
- `/api/v1/analytics` -> `routes/analytics.routes.js`
- `/api/v1/subscriptions` -> `routes/subscription.routes.js`
- `/api/v1/plans` -> `routes/plan.routes.js`
- `/test` -> inline debug handler in `app.js`

## Frozen Route Inventory (111 endpoints)

| Method | Route | Controller |
|---|---|---|
| GET | /api/v1/admin/alerts/summary | AdminController.getAlertSummaryForOrg |
| GET | /api/v1/admin/alerts/history | AdminController.getAlertHistory |
| GET | /api/v1/admin/alerts/scheduled | AdminController.getScheduledAlerts |
| POST | /api/v1/admin/alerts | AdminController.createAlert |
| GET | /api/v1/admin/alerts/:alertId | AdminController.getIndividualAlertDetails |
| GET | /api/v1/admin/areas/:areaId/alerts | AdminController.getAreaAlerts |
| POST | /api/v1/admin/sites/alerts | AdminController.getSiteAlerts |
| GET | /api/v1/admin/emergency-types | AdminController.listEmergencyTypes |
| POST | /api/v1/admin/notifications/report | AdminController.reportNotification |
| GET | /api/v1/admin/areas | AdminController.listAreas |
| POST | /api/v1/admin/areas | AdminController.createArea |
| PUT | /api/v1/admin/areas/:id | AdminController.updateArea |
| DELETE | /api/v1/admin/areas/:id | AdminController.deleteArea |
| GET | /api/v1/admin/sites/cards | AdminController.getSitesCards |
| GET | /api/v1/admin/sites/search | AdminController.searchSites |
| GET | /api/v1/admin/sites | AdminController.listSites |
| POST | /api/v1/admin/sites | AdminController.createSite |
| PUT | /api/v1/admin/sites/:id | AdminController.updateSite |
| DELETE | /api/v1/admin/sites/:id | AdminController.deleteSite |
| GET | /api/v1/admin/sites/:siteId/areas | AdminController.listAreasBySite |
| GET | /api/v1/admin/sites/:siteId/overview | AdminController.siteOverview |
| GET | /api/v1/admin/sites/:siteId/popup | AdminController.sitePopupOverview |
| GET | /api/v1/admin/sites/:siteId/popup/areas | AdminController.sitePopupAreas |
| GET | /api/v1/admin/sites/:siteId/popup/employees | AdminController.sitePopupEmployees |
| GET | /api/v1/admin/sites/:siteId/popup/alerts | AdminController.getSitePopupAlerts |
| GET | /api/v1/admin/roles | AdminController.listRoles |
| POST | /api/v1/admin/users | AdminController.createUser |
| PUT | /api/v1/admin/users/:userId/deactivate | AdminController.deactivateUser |
| GET | /api/v1/admin/users | AdminController.getEmployees |
| GET | /api/v1/admin/users/:userId | AdminController.employeeDetails |
| PUT | /api/v1/admin/users/:userId | AdminController.editEmployee |
| PUT | /api/v1/admin/users/:userId/status | AdminController.toggleEmployeeStatus |
| GET | /api/v1/admin/contracting-companies | AdminController.getAllContractingCompanies |
| POST | /api/v1/admin/contracting-companies | AdminController.createContractingCompany |
| GET | /api/v1/admin/contracting-companies/active-users | AdminController.getContractingCompanies |
| PUT | /api/v1/admin/contracting-companies/:companyId | AdminController.editContractingCompany |
| GET | /api/v1/admin/contracting-companies/:companyId/active-users | AdminController.getContractingActiveEmployees |
| DELETE | /api/v1/admin/contracting-companies/:companyId | AdminController.deleteContractingCompany |
| GET | /api/v1/admin/organization-overview | AdminController.getOrganizationOverview |
| GET | /api/v1/admin/filter-values | AdminController.getFilterValues |
| GET | /api/v1/admin/analytics/card | AdminController.getSiteAnalyticsCard |
| GET | /api/v1/admin/analytics/performance | AdminController.getSitePerformance |
| GET | /api/v1/admin/analytics/alert-distribution | AdminController.getAlertDistribution |
| GET | /api/v1/admin/analytics/response-time-trend | AdminController.getResponseTimeTrend |
| GET | /api/v1/admin/general-settings | AdminController.getGeneralSettings |
| PUT | /api/v1/admin/general-settings | AdminController.updateGeneralSettings |
| GET | /api/v1/admin/billing-history | AdminController.getBillingHistory |
| GET | /api/v1/alert/dashboard | AlertController.getDashboardStats |
| GET | /api/v1/alert | AlertController.getAlertDashboard |
| GET | /api/v1/alert/types | AlertController.getAlertTypes |
| GET | /api/v1/alert/sites | AlertController.getSites |
| GET | /api/v1/alert/areas | AlertController.getAreas |
| POST | /api/v1/alert/recipients/count | AlertController.getRecipientCountsByArea |
| POST | /api/v1/alert | AlertController.createAlert |
| PUT | /api/v1/alert/:alertId/resolve | AlertController.resolveAlert (via inline middleware) |
| GET | /api/v1/analytics/reports | AnalyticsController.getReports |
| GET | /api/v1/analytics/emergency-types/percentages | AnalyticsController.getEmergencyTypePercentages |
| GET | /api/v1/analytics/channels/performance | AnalyticsController.getPerformanceReport |
| GET | /api/v1/analytics/details | AnalyticsController.getDetailedStats |
| POST | /api/v1/config/setfcmtoken | ConfigController.setFcmToken |
| GET | /api/v1/config/getnotification | ConfigController.getNotification |
| POST | /api/v1/employee/login | EmployeeController.employeeLogin |
| POST | /api/v1/employee/respond-to-alert | EmployeeController.respondToAlert |
| GET | /api/v1/employee/response-history | EmployeeController.getResponseHistory |
| GET | /api/v1/employee/organization-info | EmployeeController.getOrganizationInfo |
| GET | /api/v1/employee/recent-notifications | EmployeeController.getRecentNotifications |
| GET | /api/v1/employee/profile | EmployeeController.getProfile |
| PUT | /api/v1/employee/profile | EmployeeController.updateProfile |
| POST | /api/v1/employee/report-visitor | EmployeeController.reportVisitor |
| PUT | /api/v1/employee/toggle-notification | EmployeeController.toggleEmergencyNotification |
| GET | /api/v1/organizations/test | (inline test handler) |
| GET | /api/v1/organizations/check-business-name | OrganizationController.checkBusinessName |
| POST | /api/v1/organizations/check-email-domain | OrganizationController.checkEmailDomain |
| POST | /api/v1/organizations/refresh | AuthController.handleRefreshToken |
| POST | /api/v1/organizations/logout | AuthController.logout |
| POST | /api/v1/organizations/send-otp | OrganizationController.sendOtp |
| POST | /api/v1/organizations/verify-otp | OrganizationController.verifyOtp |
| POST | /api/v1/organizations/login-otp | OrganizationController.loginWithOtp |
| POST | /api/v1/organizations/create-organization | OrganizationController.createOrganization |
| GET | /api/v1/organizations/organization-info | OrganizationController.getOrganizationName |
| PUT | /api/v1/organizations/update-organization | OrganizationController.updateOrganization |
| PUT | /api/v1/organizations/profile/update | OrganizationController.updateUserProfile |
| PUT | /api/v1/organizations/site/update | OrganizationController.updateSite |
| PUT | /api/v1/organizations/area/update | OrganizationController.updateArea |
| POST | /api/v1/organizations/create-site | OrganizationController.createSite |
| GET | /api/v1/organizations/sites | OrganizationController.getAllSites |
| POST | /api/v1/organizations/create-area | OrganizationController.createArea |
| GET | /api/v1/organizations/check-emaildomain | OrganizationController.checkEmailForEmployee |
| POST | /api/v1/organizations/employee-get-otp | OrganizationController.sendOtpForEmployeeSignup |
| POST | /api/v1/organizations/employee-verify-otp | OrganizationController.verifyOtpForEmployeeSignup |
| POST | /api/v1/organizations/create-employee | OrganizationController.createEmployee |
| GET | /api/v1/organizations/sites-areas | OrganizationController.getSitesAndAreasByOrganizationId |
| PUT | /api/v1/organizations/assign-site-area | OrganizationController.assignSiteAndAreaToUser |
| GET | /api/v1/plans | PlansController.getAllPlans |
| GET | /api/v1/settings/get-organization-info | SettingsController.getOrganizationInfo |
| GET | /api/v1/settings/get-alert-types | SettingsController.getAlertTypes |
| POST | /api/v1/settings/alert-type | SettingsController.createAlertType |
| PUT | /api/v1/settings/alert-type | SettingsController.updateAlertType |
| DELETE | /api/v1/settings/alert-type | SettingsController.deleteAlertType |
| POST | /api/v1/settings/create-severity-level | SettingsController.createSeverityLevel |
| GET | /api/v1/settings/get-all-severity-levels | SettingsController.getAllSeverityLevels |
| PUT | /api/v1/settings/edit-severity-level | SettingsController.editSeverityLevel |
| DELETE | /api/v1/settings/delete-severity-level | SettingsController.deleteSeverityLevel |
| POST | /api/v1/subscriptions/create | SubscriptionController.createSubscription |
| POST | /api/v1/subscriptions/preview | SubscriptionController.previewInvoice |
| GET | /api/v1/subscriptions/status | SubscriptionController.getSubscriptionStatus |
| POST | /api/v1/subscriptions/webhook | SubscriptionController.handleWebhook (via express.raw middleware) |
| GET | /api/v1/users/:userId | UserController.getUserById |
| PUT | /api/v1/users/:userId/public-key | UserController.updateUserPublicKey |
| POST | /api/v1/users/register-fcm | UserController.registerFcmToken |
| GET | /api/v1/users/organization/:orgId | UserController.getOrganizationUsers |

Notes:
- This inventory is source-of-truth for endpoint path and controller ownership checks.
- Service dependency details are tracked in `docs/controller-service-map.md`.
- Critical request/response samples for high-risk flows are tracked in `docs/high-risk-flows.md`.
