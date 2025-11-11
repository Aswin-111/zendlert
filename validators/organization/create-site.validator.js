import { z } from "zod";

const createSiteSchema = z.object({
    name: z.string().min(2, "Site name is required"),

    address_line_1: z.string().min(3, "Address line 1 is required"),
    address_line_2: z.string().optional(),

    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),

    zip_code: z
        .string()
        .regex(/^\d{5,6}$/, "Zip code must be 5 or 6 digits"),

    contact_name: z.string({ required_error: "Contact name is required" }),
    contact_email: z
        .string()
        .email("Invalid contact email"),

    contact_phone: z
        .string()
        .regex(/^[+]?[\d\s()-]{7,20}$/, "Invalid contact phone"),

    organization_id: z.string().min(1, "Organization ID is required")
});

export default createSiteSchema;
