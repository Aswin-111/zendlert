import express from "express"
import AlertController from "../controllers/alert.controller.js"
const router = express.Router()


/**
 * @route   GET /api/alerts/get_dashboard
 * @desc    Get dashboard statistics including active, history, scheduled counts, and delivery rate.
 * @access  Private (add authentication/authorization middleware as needed)
 * @query   organization_id={uuid}
 */
router.get("/get-dashboard", AlertController.getDashboardStats);
// --- NEW REPORTING ROUTE ---
/**
 * @route   GET /api/v1/alert/get_reports
 * @desc    Get aggregated report data for an organization.
 * @access  Private
 * @query   organization_id={uuid}&filter={overview|performance|details}
 */
router.get(
    '/get_reports',
    // authMiddleware, // TODO: Protect this route with authentication
    AlertController.getReports
);

router.get("/get-alertdashboard", AlertController.getAlertDashboard)

// Create alert



// detailed tab
// Get alert types
router.get("/get-alerttypes", AlertController.getAlertTypes)

// targeting tab






// get alert sites
router.get("/get-sites", AlertController.getSites)

// get alert areas
router.get("/get-areas", AlertController.getAreas)

/**
 * @route   GET /api/v1/organizations/get_recipients
 * @desc    Get the count of employees and contractors for a given set of areas within an organization.
 * @access  Private
 * @query   organization_id={uuid}&area_ids={uuid,uuid,...}
 */
router.post(
    '/get-recipients',
    // authMiddleware, // TODO: Protect this route
    AlertController.getRecipientCountsByArea
);

/**
 * @route   POST /api/v1/alert/create-alert
 * @desc    Creates a new alert, associates it with sites/areas, and prepares notifications.
 * @access  Private (Requires authentication)
 */
router.post(
    '/create-alert',
    // authMiddleware, // TODO: Protect this route
    AlertController.createAlert
);

/**
 * @route   PUT /api/v1/alert/resolve-alert
 * @desc    Resolves an active alert and sets its end time.
 * @access  Private (Requires authentication)
 * @body    { "organization_id": "uuid", "alert_id": "uuid", "message": "Resolution notes" }
 */
router.put(
    '/resolve-alert',
    // authMiddleware, // TODO: Protect this route
    AlertController.resolveAlert
);

export default router