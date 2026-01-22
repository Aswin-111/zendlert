import z from "zod";

// Validator for Area Update
const updateAreaSchema = z.object({
  area_id: z.string({ required_error: "Area ID is required" }),
  name: z.string().min(1, "Area name is required").optional(),
  description: z.string().optional().nullable(),
});
export default updateAreaSchema;
