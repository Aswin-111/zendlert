import { z } from "zod";

const addEmployeeSchema = z.object({
    organization_id: z.string().uuid({ message: "Invalid organization ID" }),
    site_id: z.string().uuid({ message: "Invalid site ID" }),
    area_id: z.string().uuid({ message: "Invalid area ID" }),
    first_name: z.string().min(1, { message: "First name is required" }),
    last_name: z.string().min(1, { message: "Last name is required" }),
    // position: z.string().min(1, { message: "Position is required" }),
    email: z.string().email({ message: "Invalid email address" }),
    phone_number: z.string().optional(),
    admin_access: z.boolean({
        required_error: "Admin access is required",
        invalid_type_error: "Value must be a boolean",
    }),
    is_employee: z.boolean({
        required_error: "Employee type is required",
        invalid_type_error: "Value must be a boolean",
    }),


    contracting_company_id: z.string().optional()


    // password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});
export default addEmployeeSchema;