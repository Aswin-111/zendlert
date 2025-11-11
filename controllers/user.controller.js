
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const UserController = {
    /**
         * @description Get a list of all users within a specific organization.
         * @route GET /api/v1/organizations/:orgId/users
         */
    getOrganizationUsers: async (req, res) => {
        const { orgId } = req.params;
        try {
            const users = await prisma.users.findMany({
                where: { organization_id: orgId },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    e2ee_public_key: true, // Renamed from publicKey
                }
            });
            res.json(users);
        } catch (err) {
            console.error('Error fetching organization users:', err);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    },

    /**
     * @description Get a single user by their ID.
     * @route GET /api/v1/users/:userId
     */
    getUserById: async (req, res) => {
        const { userId } = req.params;
        try {
            const user = await prisma.users.findUnique({
                where: { user_id: userId },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    e2ee_public_key: true,
                }
            });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        } catch (err) {
            console.error(`Error fetching user ${userId}:`, err);
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    },

    /**
     * @description Update a user's E2EE public key.
     * @route PUT /api/v1/users/:userId/public-key
     */
    updateUserPublicKey: async (req, res) => {
        const { userId } = req.params;
        const { e2ee_public_key } = req.body;

        if (!e2ee_public_key) {
            return res.status(400).json({ error: 'e2ee_public_key is required in the request body' });
        }
        try {
            await prisma.users.update({
                where: { user_id: userId },
                data: { e2ee_public_key: e2ee_public_key }
            });
            res.status(204).send(); // 204 No Content is a standard success response for PUT
        } catch (err) {
            console.error(`Error updating public key for user ${userId}:`, err);
            res.status(500).json({ error: 'Failed to update public key' });
        }
    },

    /**
     * @description Register or update a user's Firebase Cloud Messaging (FCM) token.
     * @route POST /api/v1/users/:userId/register-fcm
     */
    registerFcmToken: async (req, res) => {
        const { fcm_token, user_id } = req.body;

        if (!fcm_token) {
            return res.status(400).json({ error: 'fcmToken is required in the request body' });
        }
        try {
            await prisma.users.update({
                where: { user_id: user_id },
                data: { fcm_token: fcm_token }
            });
            res.status(200).json({ message: 'FCM token registered successfully' });
        } catch (err) {
            console.error(`Error registering FCM token for user ${user_id}:`, err);
            res.status(500).json({ error: 'Failed to register token' });
        }
    }
}

export default UserController