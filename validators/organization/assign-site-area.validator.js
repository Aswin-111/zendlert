import { z } from "zod";

const assignSiteAndAreaSchema = z.object({
  user_id: z.string({ required_error: "User ID is required" }),
  site_id: z.string({ required_error: "Site ID is required" }),
  area_id: z.string({ required_error: "Area ID is required" }),
});

export default assignSiteAndAreaSchema;
