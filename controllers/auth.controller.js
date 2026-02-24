// controllers/auth.controller.js
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { generateTokens, sendRefreshTokenCookie } from "../utils/token.js";
import logger from "../utils/logger.js";

const prisma = new PrismaClient();

const AuthController = {
  handleRefreshToken: async (req, res) => {
    try {
      // 1. Read from Request Body
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token is required." });
      }

      // 2. Find user with this specific refresh token
      const foundUser = await prisma.users.findFirst({
        where: { refresh_token: refreshToken },
        include: { role: true, organization: true },
      });

      // 3. Detected Refresh Token Reuse (Security: Token theft scenario)
      if (!foundUser) {
        try {
          // Verify if the token is valid structurally/signature-wise
          const decoded = jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET,
          );

          // If verify succeeds but user wasn't found via findFirst, it means
          // the token was valid but used previously (reuse detected).
          logger.warn(`Reuse detection triggered for user ${decoded.user_id}`);

          // Hacked! Invalidate user's refresh token family to force re-login
          await prisma.users.update({
            where: { user_id: decoded.user_id },
            data: { refresh_token: null },
          });
        } catch (err) {
          // If token is expired/invalid here, we just forbid access.
          return res.sendStatus(403);
        }
        return res.sendStatus(403); // Forbidden
      }

      // 4. Verify Token (Happy Path)
      try {
        const decoded = jwt.verify(
          refreshToken,
          process.env.REFRESH_TOKEN_SECRET,
        );

        if (foundUser.user_id !== decoded.user_id) {
          return res.sendStatus(403);
        }

        // 5. Refresh Token Rotation: Generate NEW pair
        const { accessToken, refreshToken: newRefreshToken } =
          generateTokens(foundUser);

        // 6. Save new refresh token to DB
        await prisma.users.update({
          where: { user_id: foundUser.user_id },
          data: { refresh_token: newRefreshToken },
        });

        // 7. Send Response
        res.json({
          accessToken,
          refreshToken: newRefreshToken,
        });
      } catch (err) {
        // Token expired or invalid signature
        return res.sendStatus(403);
      }
    } catch (error) {
      logger.error("handleRefreshToken Error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  },

  logout: async (req, res) => {
    try {
      // UPDATED: Read from body (matching handleRefreshToken approach)
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.sendStatus(204); // No content needed if no token sent
      }

      // Is refreshToken in DB?
      const foundUser = await prisma.users.findFirst({
        where: { refresh_token: refreshToken },
      });

      if (foundUser) {
        // Delete from DB (Revoke token)
        await prisma.users.update({
          where: { user_id: foundUser.user_id },
          data: { refresh_token: null },
        });
      }

      // No need to clearCookie since we aren't using them
      res.sendStatus(204);
    } catch (error) {
      logger.error("logout Error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
};

export default AuthController;
