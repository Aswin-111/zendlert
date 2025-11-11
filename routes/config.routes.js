import express from "express"
import ConfigController from "../controllers/config.controller.js"
const router = express.Router()

router.post("/setfcmtoken", ConfigController.setFcmToken)
router.get("/getnotification", ConfigController.getNotification)
export default router