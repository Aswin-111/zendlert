import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Access token missing" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.users.findUnique({
            where: { user_id: decoded.user_id },
            include: {
                role: true
            }
        });

        if (!user || !user.is_active) {
            return res.status(403).json({ message: "User not found or inactive" });
        }

        if (user.role.role_name.toLowerCase() !== "admin") {
            return res.status(403).json({ message: "Access denied. Admins only." });
        }

        req.user = user; // Attach user to request object
        next();
    } catch (error) {
        console.error("adminAuth error:", error);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

export default adminAuth;
