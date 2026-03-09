import express from "express";
import EmployeeController from "../controllers/employee.controller.js";
import OrganizationController from "../controllers/organization.controller.js";
import AuthController from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/sessions/password", EmployeeController.employeeLogin);
router.post("/sessions/otp", OrganizationController.loginWithOtp);
router.post("/sessions/logout", AuthController.logout);
router.post("/tokens/refresh", AuthController.handleRefreshToken);

router.post("/otp/requests", OrganizationController.sendOtp);
router.post("/otp/verifications", OrganizationController.verifyOtp);

router.post("/employees/otp/requests", OrganizationController.sendOtpForEmployeeSignup);
router.post("/employees/otp/verifications", OrganizationController.verifyOtpForEmployeeSignup);

router.get("/organizations/availability/business-name", OrganizationController.checkBusinessName);
router.post("/organizations/availability/email-domain", OrganizationController.checkEmailDomain);
router.post("/organizations/registrations", OrganizationController.createOrganization);

router.get("/employees/availability/email-domain", OrganizationController.checkEmailForEmployee);
router.post("/employees/registrations", OrganizationController.createEmployee);

export default router;
