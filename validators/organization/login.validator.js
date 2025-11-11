import { z } from "zod";

const loginSchema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

export default loginSchema