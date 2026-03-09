import { z } from "zod";

export const reportsFilterQuerySchema = z.object({
  filter: z.enum(["overview", "performance", "details"]),
});

