import express from "express";
import AdminController from "../controllers/admin.controller.js";
import verifyAdminAccess from "../middlewares/verifyAdminAccess.js";
import upload from "../middlewares/uploadProfilePic.js";
const router = express.Router();

// ✅ protect all routes below
router.use(verifyAdminAccess);

// --- Alerts ---
router.get("/alerts/summary", AdminController.getAlertSummaryForOrg);
router.get("/alerts/history", AdminController.getAlertHistory);
router.get("/alerts/scheduled", AdminController.getScheduledAlerts);
// router.post("/alerts", AdminController.createAlert);
router.post("/alerts", AdminController.createAlert);
router.get("/alerts", AdminController.getAlertDashboard);
router.put("/alerts/:alertId/resolve", AdminController.resolveAlert);
router.get("/alerts/types", AdminController.getAlertTypes);
router.get("/alerts/sites", AdminController.getSites);
router.get("/alerts/areas", AdminController.getAreas);

router.get("/alerts/:alertId", AdminController.getIndividualAlertDetails);

router.get("/areas/:areaId/alerts", AdminController.getAreaAlerts);
router.post("/sites/alerts", AdminController.getSiteAlerts);

// --- Emergency types ---
router.get("/emergency-types", AdminController.listEmergencyTypes);

// --- Notifications ---
router.post("/notifications/report", AdminController.reportNotification);

// --- Areas ---
router.get("/areas", AdminController.listAreas);
router.post("/areas", AdminController.createArea);
router.put("/areas/:id", AdminController.updateArea);
router.delete("/areas/:id", AdminController.deleteArea);

// --- Sites (specific before parameterized) ---
router.get("/sites/cards", AdminController.getSitesCards);
router.get("/sites/search", AdminController.searchSites);
router.get("/sites", AdminController.listSites);
router.post("/sites", AdminController.createSite);
router.put("/sites/:id", AdminController.updateSite);
router.delete("/sites/:id", AdminController.deleteSite);

router.get("/sites/:siteId/areas", AdminController.listAreasBySite);
router.get("/sites/:siteId/overview", AdminController.siteOverview);
router.get("/sites/:siteId/popup", AdminController.sitePopupOverview);
router.get("/sites/:siteId/popup/areas", AdminController.sitePopupAreas);
router.get("/sites/:siteId/popup/employees", AdminController.sitePopupEmployees);
router.get("/sites/:siteId/popup/alerts", AdminController.getSitePopupAlerts);

// --- Users ---
router.get("/roles", AdminController.listRoles);
router.post("/users", AdminController.createUser);
router.put("/users/:userId/deactivate", AdminController.deactivateUser);
router.get("/users", AdminController.getEmployees);
router.get("/users/:userId", AdminController.employeeDetails);
router.put("/users/:userId", AdminController.editEmployee);
router.put("/users/:userId/status", AdminController.toggleEmployeeStatus);

// --- Contracting companies ---
router.get("/contracting-companies", AdminController.getAllContractingCompanies);
router.post("/contracting-companies", AdminController.createContractingCompany);
router.get("/contracting-companies/active-users", AdminController.getContractingCompanies);
router.put("/contracting-companies/:companyId", AdminController.editContractingCompany);
router.get("/contracting-companies/:companyId/active-users", AdminController.getContractingActiveEmployees);
router.delete("/contracting-companies/:companyId", AdminController.deleteContractingCompany);

// --- Organization ---
router.get("/organization-overview", AdminController.getOrganizationOverview);
router.get("/filter-values", AdminController.getFilterValues);

// --- Analytics ---
router.get("/analytics/card", AdminController.getSiteAnalyticsCard);
router.get("/analytics/performance", AdminController.getSitePerformance);
router.get("/analytics/alert-distribution", AdminController.getAlertDistribution);
router.get("/analytics/response-time-trend", AdminController.getResponseTimeTrend);

// --- Settings & Billing ---
router.get("/general-settings", AdminController.getGeneralSettings);
router.put("/general-settings", AdminController.updateGeneralSettings);
router.get("/billing-history", AdminController.getBillingHistory);


// Web routes
router.get("/web/dashboard/cards", AdminController.getDashboardCards);
router.get("/web/dashboard/me", AdminController.getMe);
router.put("/web/personal-details", AdminController.updateAdminPersonalDetails);

router.post("/web/personal-details/email/change/request", AdminController.requestAdminEmailChange);
router.post("/web/personal-details/email/change/verify", AdminController.verifyAdminEmailChange);

router.post("/web/personal-details/phone/change/request", AdminController.requestAdminPhoneChange);
router.post("/web/personal-details/phone/change/verify", AdminController.verifyAdminPhoneChange);

router.put("/web/organization-details", AdminController.updateOrganizationDetails);

router.post(
  "/web/profile/upload-pic",
  upload.single("profile_pic"),
  AdminController.uploadProfilePic
);

export default router;
