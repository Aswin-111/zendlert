import express from "express";
import OrganizationController from "../controllers/organization.controller.js";
import verifyJWT from "../middlewares/verifyJWT.js";
import AuthController from "../controllers/auth.controller.js";

const router = express.Router();
router.get("/test", (req, res) => {
  res.json({ message: "Hello World" });
});
router.get("/check-business-name", OrganizationController.checkBusinessName);
router.post("/check-email-domain", OrganizationController.checkEmailDomain);

// --- AUTH ROUTES ---
router.get("/refresh", AuthController.handleRefreshToken);
router.post("/logout", AuthController.logout);

//OTP routes
router.post("/send-otp", OrganizationController.sendOtp);
router.post("/verify-otp", OrganizationController.verifyOtp);
router.post("/login-otp", OrganizationController.loginWithOtp);

//Organization routes
router.post("/create-organization", OrganizationController.createOrganization);
router.get(
  "/organization-info",
  verifyJWT,
  OrganizationController.getOrganizationName
);
router.put(
  "/update-organization",
  verifyJWT,
  OrganizationController.updateOrganization
);

//Sites routes
router.post("/create-site", verifyJWT, OrganizationController.createSite);
router.get("/sites", verifyJWT, OrganizationController.getAllSites);
router.post("/create-area", verifyJWT, OrganizationController.createArea);

// Employee routes
router.get("/check-emaildomain", OrganizationController.checkEmailForEmployee);
router.post(
  "/employee-get-otp",
  OrganizationController.sendOtpForEmployeeSignup
);
router.post(
  "/employee-verify-otp",
  OrganizationController.verifyOtpForEmployeeSignup
);
router.post("/create-employee", OrganizationController.createEmployee);

// Assign site and area to user
router.get(
  "/sites-areas",
  verifyJWT,
  OrganizationController.getSitesAndAreasByOrganizationId
);
router.put(
  "/assign-site-area",
  verifyJWT,
  OrganizationController.assignSiteAndAreaToUser
);

export default router;
