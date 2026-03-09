// routes/settings.routes.js
import express from "express";
import SettingsController from "../controllers/settings.controller.js";
import verifyAdminAccess from "../middlewares/verifyAdminAccess.js";

const router = express.Router();

router.use(verifyAdminAccess);

router.get("/organization", SettingsController.getOrganizationInfo);

router.get("/alert-types", SettingsController.getAlertTypes);
router.post("/alert-types", SettingsController.createAlertType);
router.put("/alert-types/:alertTypeId", SettingsController.updateAlertType);
router.delete("/alert-types/:alertTypeId", SettingsController.deleteAlertType);

router.post("/severity-levels", SettingsController.createSeverityLevel);
router.get("/severity-levels", SettingsController.getAllSeverityLevels);
router.put("/severity-levels/:severityLevelId", SettingsController.editSeverityLevel);
router.delete("/severity-levels/:severityLevelId", SettingsController.deleteSeverityLevel);

export default router;
