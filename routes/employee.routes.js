import express from "express";
import EmployeeController from "../controllers/employee.controller.js";
import verifyEmployeeAccess from "../middlewares/verifyEmployeeAccess.js";

const router = express.Router();

router.use(verifyEmployeeAccess);

router.post(
  "/alerts/:alertId/responses",
  (req, res, next) => {
    req.body = req.body || {};
    req.body.alert_id = req.params.alertId;
    return next();
  },
  EmployeeController.respondToAlert
)

router.get("/alerts/responses/history", EmployeeController.getResponseHistory);
router.get("/organization", EmployeeController.getOrganizationInfo);
router.get("/notifications/recent", EmployeeController.getRecentNotifications);
router.get("/profile", EmployeeController.getProfile);
router.put("/profile", EmployeeController.updateProfile);
router.post("/visitors/reports", EmployeeController.reportVisitor);
router.patch("/notifications/emergency-preference", EmployeeController.toggleEmergencyNotification);

export default router;
