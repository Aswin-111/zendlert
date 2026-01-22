import z from "zod";

// Validator for User Profile
const updateUserProfileSchema = z.object({
  first_name: z.string().min(1, "First name is required").optional(),
  last_name: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email format").optional(),
  phone_number: z.string().optional(),
});

export default updateUserProfileSchema;
