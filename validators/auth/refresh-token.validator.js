import { z } from "zod";

const refreshTokenSchema = z.object({
  // Mirrors legacy check: if (!refreshToken) -> 400
  refreshToken: z.any().refine((value) => Boolean(value)),
});

export default refreshTokenSchema;
