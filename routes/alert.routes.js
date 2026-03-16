import express from "express"
import AlertController from "../controllers/alert.controller.js"
import verifyEmployeeAccess from "../middlewares/verifyEmployeeAccess.js"
const router = express.Router()

router.use(verifyEmployeeAccess)

router.get("/dashboard", AlertController.getDashboardStats);
// router.get("/", AlertController.getAlertDashboard);
// router.get("/types", AlertController.getAlertTypes);
// router.get("/sites", AlertController.getSites);
// router.get("/areas", AlertController.getAreas);
router.post("/recipients/count", AlertController.getRecipientCountsByArea);
// router.post("/", AlertController.createAlert);
// router.put("/:alertId/resolve", AlertController.resolveAlert);

export default router
