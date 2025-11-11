import { z } from "zod";

const createEmployeeSchema = z.object({
    domain: z.string().min(1, "Domain is required"),
    full_name: z.string().min(1, "Full name is required"),
    email: z.string().email("Invalid email format"),
    phone: z.string().min(10, "Phone number is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

export default createEmployeeSchema