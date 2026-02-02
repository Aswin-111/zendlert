import express from "express";
import PlansController from "../controllers/plan.controller.js";
import verifyJWT from "../middlewares/verifyJWT.js";

const router = express.Router();

/**
 * @route GET /api/v1/plans
 * @desc Get all active subscription plans with features & user's current status
 * @access Protected
 */
router.get("/", PlansController.getAllPlans);

export default router;
