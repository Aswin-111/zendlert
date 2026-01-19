// controllers/auth.controller.js
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { generateTokens, sendRefreshTokenCookie } from "../utils/token.js";
import logger from "../utils/logger.js";

const prisma = new PrismaClient();

const AuthController = {
  handleRefreshToken: async (req, res) => {
    const cookies = req.cookies;

    if (!cookies?.jwt) return res.sendStatus(401); // No cookie found

    const refreshToken = cookies.jwt;
    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    // Find user with this specific refresh token
    const foundUser = await prisma.users.findFirst({
      where: { refresh_token: refreshToken },
      include: { role: true, organization: true },
    });

    // Detected Refresh Token Reuse (Security: Token theft scenario)
    if (!foundUser) {
      jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        async (err, decoded) => {
          if (!err) {
            // Verify valid token but not in DB? Hacked! Invalidate user.
            logger.warn(
              `Reuse detection triggered for user ${decoded.user_id}`
            );
            await prisma.users.update({
              where: { user_id: decoded.user_id },
              data: { refresh_token: null }, // Force logout on all devices
            });
          }
        }
      );
      return res.sendStatus(403); // Forbidden
    }

    // Verify Token
    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      async (err, decoded) => {
        if (err || foundUser.user_id !== decoded.user_id)
          return res.sendStatus(403);

        // Refresh Token Rotation: Generate NEW pair
        const { accessToken, refreshToken: newRefreshToken } =
          generateTokens(foundUser);

        // Save new refresh token to DB
        await prisma.users.update({
          where: { user_id: foundUser.user_id },
          data: { refresh_token: newRefreshToken },
        });

        // Send new cookie
        sendRefreshTokenCookie(res, newRefreshToken);

        // Send new access token
        res.json({ accessToken });
      }
    );
  },

  logout: async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204); // No content

    const refreshToken = cookies.jwt;

    // Is refreshToken in DB?
    const foundUser = await prisma.users.findFirst({
      where: { refresh_token: refreshToken },
    });

    if (foundUser) {
      // Delete from DB
      await prisma.users.update({
        where: { user_id: foundUser.user_id },
        data: { refresh_token: null },
      });
    }

    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });
    res.sendStatus(204);
  },
};

export default AuthController;
