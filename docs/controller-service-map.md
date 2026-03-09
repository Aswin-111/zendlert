# Controller Service Map

Snapshot date: 2026-03-07

This document maps each route handler to its current dependency path (controller-only logic vs helper/service usage).

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

## Baseline Observations

- Most HTTP endpoints are controller-heavy and call Prisma directly.
- `services/*` usage is limited across HTTP routes; alert and employee response flows have mixed patterns.
- This file is a baseline mapping artifact, not a redesign proposal.
