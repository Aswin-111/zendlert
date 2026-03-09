
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
const isAdminRole = (req) => String(req?.user?.role || "").toLowerCase() === "admin";

const ensureTargetUserAccess = async (req, targetUserId) => {
    if (!targetUserId) {
        return { allowed: true };
    }

    const actorUserId = req?.user?.user_id || null;
    const actorOrganizationId = req?.user?.organization_id || null;
    const actorIsAdmin = isAdminRole(req);

    if (!actorUserId && !actorOrganizationId) {
        return { allowed: true };
    }

    if (actorUserId && !actorIsAdmin && actorUserId !== targetUserId) {
        return { allowed: false, reason: "user_mismatch" };
    }

    if (actorOrganizationId && !actorIsAdmin) {
        const targetUser = await prisma.users.findUnique({
            where: { user_id: targetUserId },
            select: { organization_id: true },
        });

        if (!targetUser || targetUser.organization_id !== actorOrganizationId) {
            return { allowed: false, reason: "organization_mismatch" };
        }
    }

    return { allowed: true };
};

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
            logger.error("user.getOrganizationUsers.failed", { error: err });
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
            logger.error("user.getUserById.failed", {
                error: err,
                meta: { user_id: userId },
            });
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
            const access = await ensureTargetUserAccess(req, userId);
            if (!access.allowed) {
                logger.warn("user.updatePublicKey.forbidden", {
                    meta: {
                        requestId: req?.requestId || null,
                        actor_user_id: req?.user?.user_id || null,
                        actor_organization_id: req?.user?.organization_id || null,
                        target_user_id: userId,
                        reason: access.reason,
                    },
                });
                return res.status(403).json({ error: "Forbidden" });
            }

            await prisma.users.update({
                where: { user_id: userId },
                data: { e2ee_public_key: e2ee_public_key }
            });
            res.status(204).send(); // 204 No Content is a standard success response for PUT
        } catch (err) {
            logger.error("user.updatePublicKey.failed", {
                error: err,
                meta: { user_id: userId },
            });
            res.status(500).json({ error: 'Failed to update public key' });
        }
    },

    /**
     * @description Register or update a user's Firebase Cloud Messaging (FCM) token.
     * @route POST /api/v1/users/:userId/register-fcm
     */
    registerFcmToken: async (req, res) => {
        const { fcm_token, user_id: targetUserId } = req.body;

        if (!fcm_token) {
            return res.status(400).json({ error: 'fcmToken is required in the request body' });
        }
        try {
            const access = await ensureTargetUserAccess(req, targetUserId);
            if (!access.allowed) {
                logger.warn("user.registerFcmToken.forbidden", {
                    meta: {
                        requestId: req?.requestId || null,
                        actor_user_id: req?.user?.user_id || null,
                        actor_organization_id: req?.user?.organization_id || null,
                        target_user_id: targetUserId,
                        reason: access.reason,
                    },
                });
                return res.status(403).json({ error: "Forbidden" });
            }

            await prisma.users.update({
                where: { user_id: targetUserId },
                data: { fcm_token: fcm_token }
            });
            res.status(200).json({ message: 'FCM token registered successfully' });
        } catch (err) {
            logger.error("user.registerFcmToken.failed", {
                error: err,
                meta: { user_id: targetUserId },
            });
            res.status(500).json({ error: 'Failed to register token' });
        }
    }
}

export default UserController
