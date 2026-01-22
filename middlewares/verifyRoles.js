import logger from "../utils/logger.js";

/**
 * Middleware to ensure the user is an Admin.
 * MUST be used after verifyJWT.
 */
export const verifyAdmin = (req, res, next) => {
  // 1. Safety check: Ensure verifyJWT ran first
  if (!req.user) {
    logger.error("verifyAdmin middleware used without verifyJWT");
    return res.status(401).json({ message: "Unauthorized: No user found" });
  }

  // 2. Check the Role
  // Based on your token payload: "role": "admin"
  if (req.user.role !== "admin") {
    logger.warn(
      `Access denied. User ${req.user.user_id} with role ${req.user.role} tried to access admin route.`,
    );
    return res
      .status(403)
      .json({ message: "Forbidden: Access is denied. Admins only." });
  }

  next();
};

/**
 * Middleware to ensure the user is an Employee.
 * MUST be used after verifyJWT.
 */
export const verifyEmployee = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized: No user found" });
  }

  if (req.user.role !== "employee") {
    return res
      .status(403)
      .json({ message: "Forbidden: Access is denied. Employees only." });
  }

  next();
};
