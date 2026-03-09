import express from "express";
import OrganizationController from "../controllers/organization.controller.js";
import verifyAdminAccess from "../middlewares/verifyAdminAccess.js";

const router = express.Router();

router.use(verifyAdminAccess);

router.get("/details", OrganizationController.getOrganizationName);

router.put("/details", OrganizationController.updateOrganization);

router.put("/users/profile", OrganizationController.updateUserProfile);

router.post("/sites", OrganizationController.createSite);
router.get("/sites", OrganizationController.getAllSites);
router.put("/sites/:siteId", OrganizationController.updateSite);

router.post("/areas", OrganizationController.createArea);
router.put("/areas/:areaId", OrganizationController.updateArea);

router.get("/sites/areas", OrganizationController.getSitesAndAreasByOrganizationId);
router.put("/users/:userId/site-area", OrganizationController.assignSiteAndAreaToUser);

export default router;
