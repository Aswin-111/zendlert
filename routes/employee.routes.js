import express from "express"
import EmployeeController from "../controllers/employee.controller.js";

const router = express.Router();
router.post("/login", EmployeeController.employeeLogin);
router.post('/respond-to-alert', EmployeeController.respondToAlert)



export default router;