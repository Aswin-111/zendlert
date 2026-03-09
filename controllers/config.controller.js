import logger from "../utils/logger.js"; // your Winston logger
import prisma from "../utils/prisma.js";

const isAdminRole = (req) => String(req?.user?.role || "").toLowerCase() === "admin";

const ConfigController = {
    setFcmToken: async (req, res) => {
        try {
            const { fcm_token, user_id } = req.body;
            const actorUserId = req?.user?.user_id || null;
            const actorOrganizationId = req?.user?.organization_id || null;
            const actorIsAdmin = isAdminRole(req);

            if (!fcm_token) {
                return res.status(400).json({ message: "FCM token is required" });
            }
            if (!user_id) {
                return res.status(400).json({ message: "User ID is required" });
            }
            if (actorUserId && !actorIsAdmin && actorUserId !== user_id) {
                logger.warn("config.setFcmToken.forbidden_user_mismatch", {
                    meta: { actor_user_id: actorUserId, target_user_id: user_id },
                });
                return res.status(403).json({ message: "Forbidden" });
            }

            if (actorOrganizationId && !actorIsAdmin) {
                const targetUser = await prisma.users.findUnique({
                    where: { user_id },
                    select: { organization_id: true },
                });

                if (!targetUser || targetUser.organization_id !== actorOrganizationId) {
                    logger.warn("config.setFcmToken.forbidden_organization_mismatch", {
                        meta: {
                            actor_user_id: actorUserId,
                            actor_organization_id: actorOrganizationId,
                            target_user_id: user_id,
                        },
                    });
                    return res.status(403).json({ message: "Forbidden" });
                }
            }

            logger.info("config.setFcmToken.requested", {
                meta: { user_id },
            });

            const user = await prisma.users.update({
                where: { user_id: user_id },
                data: { fcm_token },
            });
            return res.status(200).json({ message: "FCM token set successfully", user });
        }


        catch (err) {
            logger.error("config.setFcmToken.error", { error: err, meta: { user_id: req.body?.user_id } });
            return res.status(500).json({ message: "Internal server error" });
        }
    },
    getNotification: async (req, res) => {
        try {
            const usersoforganization = await prisma.users.findMany({
                where: {
                    organization_id: "f76489ee-3b42-4f14-8618-ac0dc510a74c"
                },
                select: {
                    fcm_token: true
                }
            })
            logger.info("config.getNotification.fetched", {
                meta: { recipient_count: usersoforganization.length },
            });
            return res.status(200).json({ usersoforganization });
        } catch (error) {
            logger.error("config.getNotification.error", { error });
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }

};

export default ConfigController
