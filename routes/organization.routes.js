import express from "express";
import OrganizationController from "../controllers/organization.controller.js";

const router = express.Router();
router.get("/test", (req, res) => {
  res.json({ message: "Hello World" });
});
router.get("/check-business-name", OrganizationController.checkBusinessName);
router.post("/check-email-domain", OrganizationController.checkEmailDomain);

//OTP routes
router.post("/send-otp", OrganizationController.sendOtp);
router.post("/verify-otp", OrganizationController.verifyOtp);
router.post("/login-otp", OrganizationController.loginWithOtp);

//Organization routes
router.post("/create-organization", OrganizationController.createOrganization);
router.get("/organization-info", OrganizationController.getOrganizationName);
router.put("/update-organization", OrganizationController.updateOrganization);

//Sites routes
router.post("/create-site", OrganizationController.createSite);
router.get("/sites", OrganizationController.getAllSites);
router.post("/create-area", OrganizationController.createArea);

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
  OrganizationController.getSitesAndAreasByOrganizationId
);
router.put("/assign-site-area", OrganizationController.assignSiteAndAreaToUser);

export default router;
