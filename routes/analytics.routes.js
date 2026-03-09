import express from "express";
import AnalyticsController from "../controllers/analytics.controller.js";
import verifyAdminAccess from "../middlewares/verifyAdminAccess.js";

const router = express.Router();

router.use(verifyAdminAccess);

router.get("/reports", AnalyticsController.getReports);
router.get("/emergency-types/percentages", AnalyticsController.getEmergencyTypePercentages);
router.get("/channels/performance", AnalyticsController.getPerformanceReport);
router.get("/details", AnalyticsController.getDetailedStats);

export default router;
