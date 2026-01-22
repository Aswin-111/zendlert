// routes/employee.route.js
import express from "express";
import EmployeeController from "../controllers/employee.controller.js";
import verifyJWT from "../middlewares/verifyJWT.js";

const router = express.Router();

// Public
router.post("/login", EmployeeController.employeeLogin);

// Protected
router.post("/respond-to-alert", verifyJWT, EmployeeController.respondToAlert);
router.get("/response-history", verifyJWT, EmployeeController.getResponseHistory);
router.get(
    "/organization-info",
    verifyJWT,
    EmployeeController.getOrganizationInfo
);
router.get(
    "/recent-notifications",
    verifyJWT,
    EmployeeController.getRecentNotifications
);
router.get(
    "/profile",
    verifyJWT,
    EmployeeController.getProfile
);
router.put("/profile", verifyJWT, EmployeeController.updateProfile);
export default router;
