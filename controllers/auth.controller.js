import jwt from "jsonwebtoken";
import { generateTokens } from "../utils/token.js";
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
import refreshTokenSchema from "../validators/auth/refresh-token.validator.js";

const AuthController = {
  handleRefreshToken: async (req, res) => {
    const parsed = refreshTokenSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Refresh token is required." });
    }
    const { refreshToken } = parsed.data;

    const foundUser = await prisma.users.findFirst({
      where: { refresh_token: refreshToken },
      include: { role: true, organization: true },
    });

    if (!foundUser) {
      jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        async (err, decoded) => {
          const decodedUserId =
            !err && decoded && typeof decoded === "object" ? decoded.user_id : null;
          if (decodedUserId) {
            logger.warn(`Reuse detection triggered for user ${decodedUserId}`);
            try {
              await prisma.users.update({
                where: { user_id: decodedUserId },
                data: { refresh_token: null },
              });
            } catch (updateErr) {
              logger.error("Failed to clear refresh token during reuse detection", {
                error: updateErr,
                meta: { user_id: decodedUserId },
              });
            }
          }
        },
      );
      return res.sendStatus(403); // Forbidden
    }

    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      async (err, decoded) => {
        const decodedUserId =
          decoded && typeof decoded === "object" ? decoded.user_id : undefined;
        if (err || foundUser.user_id !== decodedUserId)
          return res.sendStatus(403);

        const { accessToken, refreshToken: newRefreshToken } =
          generateTokens(foundUser);

        await prisma.users.update({
          where: { user_id: foundUser.user_id },
          data: { refresh_token: newRefreshToken },
        });

        res.json({
          accessToken,
          refreshToken: newRefreshToken,
        });
      },
    );
  },
  logout: async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204); // No content

    const refreshToken = cookies.jwt;

    const foundUser = await prisma.users.findFirst({
      where: { refresh_token: refreshToken },
    });

    if (foundUser) {
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
