import { z } from "zod";

const createAreaSchema = z.object({
    site_id: z.string().uuid({ message: "Invalid site ID" }),
    name: z.string().min(1, "Area name is required"),
    description: z.string().optional()
});

export default createAreaSchema