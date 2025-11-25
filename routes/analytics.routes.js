import express from "express";
import OverviewController from "../controllers/overview.controller.js";
import PerformanceController from "../controllers/performance.controller.js";
import DetailedController from "../controllers/detailed.controller.js";

const router = express.Router();

// GET /api/v1/analytics/overview/get_reports
router.get(
  "/overview/get-reports",
  // authMiddleware, // TODO: Protect this route with authentication
  OverviewController.getReports
);

// GET /api/v1/analytics/overview/emergency-type-percentages
router.get(
  "/overview/emergency-type-percentages",
  // authMiddleware, // TODO: Protect this route with authentication
  OverviewController.getEmergencyTypePercentages
);

// GET /api/v1/analytics/channel-performance
router.get("/channel-performance", PerformanceController.getPerformanceReport);

// GET /api/v1/analytics/detailed
router.get("/detailed", DetailedController.getDetailedStats);

export default router;
