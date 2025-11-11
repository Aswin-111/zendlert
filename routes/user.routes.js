import express from 'express';
// Import the entire controller object
import UserController from "../controllers/user.controller.js"

const router = express.Router();

// --- User Specific Routes ---
// These are typically prefixed with /api/v1/users in your app.js

// Route to get a single user by their ID
// e.g., GET http://localhost:6000/api/v1/users/some-uuid-1234
router.get('/:userId', UserController.getUserById);

// Route to update a user's public key
// e.g., PUT http://localhost:6000/api/v1/users/some-uuid-1234/public-key
router.put('/:userId/public-key', UserController.updateUserPublicKey);

// Route to register a user's FCM token
// e.g., POST http://localhost:6000/api/v1/users/some-uuid-1234/register-fcm
router.post('/register-fcm', UserController.registerFcmToken);


// --- Organization Specific Route ---
// This is placed here for convenience but could also live in `organization.routes.js`.
// The full path would be something like /api/v1/organizations/:orgId/users.
// To make this work, you would mount this router in app.js under '/api/v1/organizations' as well.

// For simplicity with the current setup, let's create a distinct path.
// Route to get all users in an organization
// e.g., GET http://localhost:6000/api/v1/users/organization/org-uuid-5678
router.get('/organization/:orgId', UserController.getOrganizationUsers);


export default router;

