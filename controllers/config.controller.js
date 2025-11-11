import { PrismaClient } from "@prisma/client";

import logger from "../utils/logger.js"; // your Winston logger

const prisma = new PrismaClient();

const ConfigController = {
    setFcmToken: async (req, res) => {
        try {
            const { fcm_token, user_id } = req.body;
            const user_name = await prisma.users.findUnique({
                where: { user_id: user_id },
            })
            console.log("username", user_name, "user_id : ", user_id)   
            if (user_name?.first_name && user_name?.last_name) {
                console.log("setfcmtoken called by : ", user_name.first_name, " ", user_name.last_name)
            }


            if (!fcm_token) {
                return res.status(400).json({ message: "FCM token is required" });
            }
            if (!user_id) {
                return res.status(400).json({ message: "User ID is required" });
            }

            const user = await prisma.users.update({
                where: { user_id: user_id },
                data: { fcm_token },
            });
            return res.status(200).json({ message: "FCM token set successfully", user });
        }


        catch (err) {
            logger.error(err);
            console.log(err)
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
            console.log(usersoforganization)
            return res.status(200).json({ usersoforganization });
        } catch (error) {
            console.error("getNotification error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }

};

export default ConfigController