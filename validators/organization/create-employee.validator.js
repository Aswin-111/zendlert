import { z } from "zod";

const createEmployeeSchema = z.object({
  first_name: z.string().min(1, "First name is required").trim(),
  last_name: z.string().min(1, "Last name is required").trim(),
  email: z.string().email("Invalid email format").toLowerCase(),
  phone: z.string().min(10, "Phone number is required"),
});

export default createEmployeeSchema;