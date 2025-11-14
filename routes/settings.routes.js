// routes/settings.routes.js
import express from "express";
import SettingsController from "../controllers/settings.controller.js";

const router = express.Router();

// GET /api/v1/settings/get-organization-info?organization_id=UUID
router.get("/get-organization-info", SettingsController.getOrganizationInfo);

// GET /api/v1/settings/get-alert-types
router.get("/get-alert-types", SettingsController.getAlertTypes);

// POST /api/v1/settings/alert-type
router.post("/alert-type", SettingsController.createAlertType);

// UPDATE /api/v1/settings/alert-type/id
router.put("/alert-type", SettingsController.updateAlertType);

// DELETE /api/v1/settings/alert-type/id
router.delete("/alert-type", SettingsController.deleteAlertType);

// POST /api/v1/settings/create-severity-level
router.post("/create-severity-level", SettingsController.createSeverityLevel);

// GET all Severity Levels for org
router.get("/get-all-severity-levels", SettingsController.getAllSeverityLevels);

// EDIT Severity Level
router.put("/edit-severity-level", SettingsController.editSeverityLevel);

// DELETE Severity Level
router.delete("/delete-severity-level", SettingsController.deleteSeverityLevel);


export default router;
