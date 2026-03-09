import { z } from "zod";

const adminCreateAlertSchema = z.object({
  emergency_type_id: z
    .string({ required_error: "Emergency type id is required" })
    .uuid(),
  message: z.string({ required_error: "Message is required" }),
  start_time: z.string({ required_error: "Start time is required" }),
  end_time: z.string({ required_error: "End time is required" }),
});

export default adminCreateAlertSchema;
