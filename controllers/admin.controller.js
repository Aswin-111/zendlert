import { PrismaClient, DeliveryStatus, UserTypes } from "@prisma/client";
import moment from "moment";
import bcrypt from "bcrypt";
import z from "zod";

import admin from "../config/firebase.auth.js";
import logger from "../utils/logger.js"; // your Winston logger

const prisma = new PrismaClient();
import addEmployeeSchema from "../validators/admin/add-employee.validator.js";
const AdminController = {
    getOrganizationAlerts: async (req, res) => {
        try {
            const { organization_id, alert_type } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // Fetch organization name
            const organization = await prisma.organizations.findUnique({
                where: { organization_id },
                select: { name: true },
            });
            if (!organization) {
                return res.status(404).json({ message: "Organization not found" });
            }
            // Fetch alerts by type and organization
            const alerts = await prisma.alerts.findMany({
                where: {
                    organization_id,
                    ...(alert_type && { message: { contains: alert_type, mode: "insensitive" } }),
                },
                include: {
                    Notification_Recipients: true,
                },
            });

            const totalAlerts = alerts.length;

            const responseTimes = [];
            let acknowledgedCount = 0;

            for (const alert of alerts) {
                alert.Notification_Recipients.forEach((recipient) => {
                    if (recipient.acknowledged_at) {
                        acknowledgedCount++;
                        if (recipient.delivered_at) {
                            const responseTime = new Date(recipient.acknowledged_at) - new Date(recipient.delivered_at);
                            responseTimes.push(responseTime);
                        }
                    }
                });
            }

            const avgResponseTime = responseTimes.length
                ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000) // in seconds
                : 0;

            const responseRate = totalAlerts ? (acknowledgedCount / totalAlerts) * 100 : 0;

            // Weather alert detection (example logic)
            const weatherAlert = alerts.some(alert => alert.message.toLowerCase().includes("weather"));

            // Active users
            const activeUsersCount = await prisma.users.count({
                where: {
                    organization_id,
                    is_active: true,
                },
            });

            // All Areas
            const areas = await prisma.areas.findMany({
                where: {
                    site: {
                        organization_id
                    }
                },
                select: {
                    id: true,
                    name: true,
                    description: true
                }
            });

            return res.status(200).json({
                organization_name: organization.name,
                total_alerts: totalAlerts,
                response_rate: `${responseRate.toFixed(2)}%`,
                average_response_time: `${avgResponseTime} seconds`,
                alert_success: acknowledgedCount,
                active_users: activeUsersCount,
                areas,
            });
        } catch (error) {
            logger.error("getOrganizationAlerts error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getBuildingAlerts: async (req, res) => {
        try {
            const { building_name } = req.body;

            if (!building_name || typeof building_name !== "string") {
                return res.status(400).json({ message: "building_name is required" });
            }

            // 1️⃣ Fetch area + organization
            const area = await prisma.areas.findFirst({
                where: { name: building_name },
                include: {
                    site: {
                        include: {
                            organization: {
                                select: {
                                    organization_id: true,
                                    name: true,
                                    main_contact_name: true,
                                    main_contact_email: true,
                                    main_contact_phone: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!area) {
                return res.status(404).json({ message: "Building (area) not found" });
            }

            const organizationId = area.site.organization.organization_id;

            // 2️⃣ Fetch alerts for this area
            const alerts = await prisma.alerts.findMany({
                where: {
                    organization_id: organizationId,
                    Alert_Areas: {
                        some: {
                            area_id: area.id,
                        },
                    },
                },
                orderBy: {
                    created_at: "desc",
                },
            });

            const now = new Date();

            const recentAlerts = alerts.filter(
                (a) => a.created_at <= now && (!a.scheduled_time || a.scheduled_time <= now)
            );

            const upcomingAlerts = alerts.filter(
                (a) => a.scheduled_time && a.scheduled_time > now
            );

            const scheduledAlerts = alerts.filter(
                (a) => a.scheduled_time !== null
            );

            // 3️⃣ SINGLE emergency contact (from organization)
            const emergencyContact =
                area.site.organization.main_contact_name
                    ? {
                        name: area.site.organization.main_contact_name,
                        email: area.site.organization.main_contact_email,
                        phone: area.site.organization.main_contact_phone,
                    }
                    : null;

            // 4️⃣ Response
            return res.status(200).json({
                building: area.name,
                organization: area.site.organization.name,

                recent_alerts: recentAlerts,
                upcoming_alerts: upcomingAlerts,
                scheduled_alerts: scheduledAlerts,

                emergency_contact: emergencyContact, // ✅ SINGLE OBJECT
            });
        } catch (error) {
            console.error("getBuildingAlerts error:", error);
            return res.status(500).json({
                message: "Server error",
                error: error.message,
            });
        }
    },

    getAllAreasByOrganizationId: async (req, res) => {
        const { organization_id } = req.query;

        try {
            // Step 1: Fetch all sites of the organization
            if (!organization_id) {
                return res.status(400).json({ message: "organizationId is required." });
            }
            const sites = await prisma.sites.findMany({
                where: { organization_id: organization_id },
                select: { id: true },
            });

            const siteIds = sites.map(site => site.id);

            // Step 2: Fetch all areas related to these sites
            const areas = await prisma.areas.findMany({
                where: {
                    site_id: { in: siteIds },
                },
            });

            return res.status(200).json({ organization_id, areas });
        } catch (error) {
            logger?.error("getAreasByOrganizationId error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getAllBuildingAlerts: async (req, res) => {
        try {
            const { building_name } = req.body;

            if (!building_name || typeof building_name !== "string") {
                return res.status(400).json({ message: "Building name is required." });
            }

            // Step 1: Get Site (building) by name
            const site = await prisma.sites.findFirst({
                where: { name: building_name },
                include: {
                    Areas: true,
                    organization: true,
                },
            });

            if (!site) {
                return res.status(404).json({ message: "Building not found." });
            }

            const siteId = site.id;

            // Step 2: Get Alerts linked to this building via Alert_Sites
            const alerts = await prisma.alerts.findMany({
                where: {
                    Alert_Sites: {
                        some: {
                            site_id: siteId
                        }
                    }
                },
                orderBy: { created_at: "desc" },
            });

            const now = new Date();
            const recentAlerts = alerts.filter(alert => alert.start_time && alert.start_time <= now);
            const upcomingAlerts = alerts.filter(alert => alert.scheduled_time && alert.scheduled_time > now);
            const scheduledAlerts = alerts.filter(alert => !alert.start_time && alert.scheduled_time);

            // Step 3: Emergency contacts: Users from the site
            const emergencyContacts = await prisma.users.findMany({
                where: {
                    site_id: siteId,
                    is_active: true
                },
                select: {
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone_number: true
                }
            });

            return res.status(200).json({
                building: building_name,
                organization: site.organization?.name || null,
                total_alerts: alerts.length,
                recent_alerts: recentAlerts,
                upcoming_alerts: upcomingAlerts,
                scheduled_alerts: scheduledAlerts,
                emergency_contacts: emergencyContacts
            });

        } catch (error) {
            console.error("getAllBuildingAlerts error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getAllEmployees: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required." });
            }

            // 1. Verify org exists (optional but recommended)
            const orgExists = await prisma.organizations.findUnique({
                where: { organization_id },
                select: { organization_id: true, name: true }
            });
            if (!orgExists) {
                return res.status(404).json({ message: "Organization not found." });
            }

            // 2. Fetch active users belonging to this organization
            const employees = await prisma.users.findMany({
                where: {
                    organization_id,
                    is_active: true
                },
                select: {
                    user_id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    phone_number: true,
                    role: {
                        select: { role_name: true }
                    },
                    site: {
                        select: { name: true }
                    },
                    area: {
                        select: { name: true }
                    }
                },
                orderBy: { created_at: "desc" }
            });

            return res.status(200).json({
                organization: { id: orgExists.organization_id, name: orgExists.name },
                total_employees: employees.length,
                employees
            });
        } catch (error) {
            console.error("getAllEmployees error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getAllSites: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required." });
            }

            // Optional: Verify organization exists
            const orgExists = await prisma.organizations.findUnique({
                where: { organization_id },
                select: { organization_id: true },
            });
            if (!orgExists) {
                return res.status(404).json({ message: "Organization not found." });
            }

            // Fetch sites belonging to the organization
            const sites = await prisma.sites.findMany({
                where: { organization_id },
                orderBy: { created_at: "desc" },
            });

            return res.status(200).json({ total_sites: sites.length, sites });
        } catch (error) {
            console.error("getAllSites error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },

    getAllAreas: async (req, res) => {
        try {
            const { site_id } = req.query;

            if (!site_id) {
                return res.status(400).json({ message: "site_id is required." });
            }

            // Verify site exists
            const siteExists = await prisma.sites.findUnique({
                where: { id: site_id },
                select: { id: true },
            });
            if (!siteExists) {
                return res.status(404).json({ message: "Site not found." });
            }

            // Fetch areas belonging to the site
            const areas = await prisma.areas.findMany({
                where: { site_id },
                orderBy: { created_at: "desc" },
            });

            return res.status(200).json({ total_areas: areas.length, areas });
        } catch (error) {
            console.error("getAllAreas error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getAllRoles: async (req, res) => {
        try {

            const roles = prisma.roles.findMany()
            console.log(roles)
            return res.json({ roles })
        }
        catch (err) {
            return res.status(500).json({ message: "something went wrong", error: err })
        }
    },
    addEmployee: async (req, res) => {
        try {
            const parsed = addEmployeeSchema.safeParse(req.body);
            if (!parsed.success) {
                const errors = parsed.error.errors.map(e => e.message);
                return res.status(400).json({ message: "Validation failed", errors });
            }

            const { organization_id, site_id, area_id, first_name, last_name, email, phone_number, admin_access, is_employee, contracting_company_id } = parsed.data;

            // Find role based on admin_access
            const roleName = admin_access ? "admin" : "employee";
            const role = await prisma.roles.findFirst({ where: { role_name: roleName } });

            if (!role) {
                return res.status(400).json({ message: `${roleName} role not found.` });
            }

            // Hash the password
            // const saltRounds = 10;
            // const password_hash = await bcrypt.hash(password, saltRounds);

            // Create user
            const user_type = is_employee ? UserTypes.employee : UserTypes.contractor

            const newUser = await prisma.users.create({
                data: {
                    organization_id,
                    site_id,
                    area_id,
                    email: email.toLowerCase(),
                    password_hash: "1234",
                    first_name,
                    last_name,
                    phone_number: phone_number || "",
                    role_id: role.id,
                    user_type,
                },
            });
            if (user_type === UserTypes.employee) {
                await prisma.employees.create({ data: { user_id: newUser.user_id } })
            }
            else {

                if (!contracting_company_id) {
                    return res.status(400).json({ message: "Contracting company is required." });
                }


                await prisma.contractors.create({
                    data: {
                        user_id: newUser.user_id,
                        contracting_company_id,
                    },
                });

            }

            return res.status(200).json({
                message: "Employee created successfully",
                user: {
                    id: newUser.user_id,
                    name: `${newUser.first_name} ${newUser.last_name}`,
                    email: newUser.email,
                    role: role.role_name,
                },
            });
            // send email for the user asking complete signup process
        } catch (error) {
            // Check for Prisma unique constraint error
            if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
                return res.status(409).json({ message: "Email is already in use. Please use a different email address." });
            }
            console.error("addEmployee error:", error);
            // Send a generic error without Prisma details
            return res.status(500).json({ message: "Server error", });
        }
    },
    // employeeEditDetails: async (req, res) => {
    //     try {
    //         const { user_id, organization_id } = req.query;

    //         if (!user_id) {
    //             return res.status(400).json({ message: "user_id is required." });
    //         }
    //         if (!organization_id) {
    //             return res.status(400).json({ message: "organization_id is required." });
    //         }

    //         // Check if user exists and belongs to the specified organization (optional, but recommended)
    //         const user = await prisma.users.findUnique({
    //             where: { user_id },
    //             include: {
    //                 organization: true, // Include organization relation to validate
    //                 site: true,
    //                 area: true
    //             },
    //         });

    //         if (!user) {
    //             return res.status(404).json({ message: "User not found." });
    //         }
    //         if (user.organization_id !== organization_id) {
    //             return res.status(400).json({
    //                 message: "User does not belong to the specified organization.",
    //             });
    //         }

    //         // Fetch all sites under the organization
    //         const sites = await prisma.sites.findMany({
    //             where: { organization_id },
    //             orderBy: { created_at: "desc" },
    //         });

    //         return res.status(200).json({
    //             user,
    //             total_sites: sites.length,
    //             sites,
    //         });
    //     } catch (error) {
    //         console.error("employeeEditDetails error:", error);
    //         return res.status(500).json({ message: "Server error", error: error.message });
    //     }
    // },
    // updateEmployee: async (req, res) => {
    //     try {
    //         const {
    //             user_id,
    //             organization_id,
    //             first_name,
    //             last_name,
    //             email,
    //             phone,
    //             site_id,
    //             area_id,
    //         } = req.body;

    //         if (!organization_id || !user_id) {
    //             return res.status(400).json({ message: "organization_id and user_id are required." });
    //         }

    //         // Verify the employee exists and belongs to the organization
    //         const existingUser = await prisma.users.findUnique({
    //             where: { user_id },
    //             select: { organization_id: true },
    //         });
    //         if (!existingUser || existingUser.organization_id !== organization_id) {
    //             return res.status(404).json({ message: "Employee not found in this organization." });
    //         }

    //         // Optional: Validate provided site and area IDs if present
    //         if (site_id) {
    //             const site = await prisma.sites.findUnique({ where: { id: site_id } });
    //             if (!site || site.organization_id !== organization_id) {
    //                 return res.status(400).json({ message: "Invalid site_id for this organization." });
    //             }
    //         }
    //         if (area_id) {
    //             const area = await prisma.areas.findUnique({ where: { id: area_id } });
    //             if (!area) {
    //                 return res.status(400).json({ message: "Invalid area_id." });
    //             }
    //             // Optionally check area belongs under the site/organization if needed
    //         }

    //         // Prepare update data object, only include fields if they are provided
    //         const updateData = {};
    //         if (first_name !== undefined) updateData.first_name = first_name;
    //         if (last_name !== undefined) updateData.last_name = last_name;
    //         if (email !== undefined) updateData.email = email;
    //         if (phone !== undefined) updateData.phone_number = phone;
    //         if (site_id !== undefined) updateData.site_id = site_id;
    //         if (area_id !== undefined) updateData.area_id = area_id;

    //         // For emergency contact fields, if you have them added on Users or separate model,
    //         // update here accordingly. Assuming on Users with fields emergency_contact_name and emergency_contact_phone:


    //         // Perform the update
    //         const updatedUser = await prisma.users.update({
    //             where: { user_id },
    //             data: updateData,
    //         });

    //         return res.status(200).json({
    //             message: "Employee updated successfully",
    //             employee: updatedUser,
    //         });
    //     } catch (error) {
    //         console.error("updateEmployee error:", error);
    //         return res.status(500).json({ message: "Server error", error: error.message });
    //     }
    // },
    toggleEmployeeStatus: async (req, res) => {
        try {
            const { user_id, organization_id, status } = req.body;

            // 1. Validate that all required query parameters are present
            if (!user_id || !organization_id || !status) {
                return res.status(400).json({ message: "user_id, organization_id, and status are required query parameters." });
            }

            // 2. Validate the 'status' parameter value
            if (status !== 'activate' && status !== 'deactivate') {
                return res.status(400).json({ message: "Invalid status value. Must be 'activate' or 'deactivate'." });
            }

            // 3. Find the user to ensure they exist
            const user = await prisma.users.findUnique({
                where: { user_id },
                select: { user_id: true, is_active: true, organization_id: true },
            });

            if (!user) {
                return res.status(404).json({ message: "User not found." });
            }

            // 4. SECURITY CHECK: Ensure the found user belongs to the specified organization
            if (user.organization_id !== organization_id) {
                return res.status(403).json({ message: "Forbidden: User does not belong to the specified organization." });
            }

            // 5. Check if the user is already in the desired state to avoid redundant updates
            const newActiveState = status === 'activate'; // Converts 'activate' to true, 'deactivate' to false

            if (user.is_active === newActiveState) {
                return res.status(409).json({ message: `User is already ${status}d.` });
            }

            // 6. Update the user's is_active status
            await prisma.users.update({
                where: { user_id },
                data: { is_active: newActiveState },
            });

            // 7. Return a dynamic success message
            return res.status(200).json({ message: `User successfully ${status}d.` });

        } catch (error) {
            console.error("toggleEmployeeStatus error:", error);
            // Assuming you have a logger utility available in this scope
            // logger.error("toggleEmployeeStatus error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },

    // alerts
    getAlerts: async (req, res) => {
        try {
            const alerts = await prisma.emergency_Types.findMany();
            console.log(alerts)
            return res.status(200).json({ alerts });
        } catch (error) {
            console.error("getAlerts error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },


    createAlert: async (req, res) => {

        try {
            const createAlertSchema = z.object({
                user_id: z.string({ required_error: "User id is required" }).uuid(),
                organization_id: z.string({ required_error: "Organization id is required" }).uuid(),
                emergency_type_id: z.string({ required_error: "Emergency type id is required" }).uuid(),
                message: z.string({ required_error: "Message is required" }),
                start_time: z.string({ required_error: "Start time is required" }),
                end_time: z.string({ required_error: "End time is required" })
            });

            // Validate body
            const parsed = createAlertSchema.parse(req.body);

            // Validate the time order using moment.js
            const startTime = moment(parsed.start_time, moment.ISO_8601, true);
            const endTime = moment(parsed.end_time, moment.ISO_8601, true);

            if (!startTime.isValid() || !endTime.isValid()) {
                return res.status(400).json({ error: "Invalid start or end time format" });
            }
            if (startTime.isAfter(endTime)) {
                return res.status(400).json({ error: "Start time cannot be after end time." });
            }

            // Save to backend (example using Prisma ORM)
            const alert = await prisma.alerts.create({
                data: {
                    user_id: parsed.user_id,
                    organization_id: parsed.organization_id,
                    emergency_type_id: parsed.emergency_type_id,
                    message: parsed.message,
                    start_time: startTime.toDate(),
                    end_time: endTime.toDate(),
                    status: "active"
                }
            });


            const usersoforganization = await prisma.users.findMany({
                where: {
                    organization_id: parsed.organization_id
                },
                select: {
                    fcm_token: true,
                    user_id: true
                }
            })

            console.log(usersoforganization)
            const alert_name = await prisma.emergency_Types.findUnique({ where: { id: parsed.emergency_type_id }, select: { name: true } })

            console.log("------------------------------------------------------")
            if (usersoforganization.length > 0) {
                usersoforganization.forEach(i => {
                    const token = i.fcm_token;
                    if (token) {
                        const individualMessage = {
                            notification: { title: alert_name.name, body: parsed.message },
                            token: token
                        };
                        (async () => {
                            try {
                                console.log("i: ", i)
                                await admin.messaging().send(individualMessage);

                                await prisma.notification_Recipients.create({
                                    data: {
                                        alert_id: alert.id,
                                        user_id: i.user_id,
                                    }
                                })
                            }
                            catch (err) {
                                console.log(err)
                                if (err.code === 'messaging/registration-token-not-registered') {
                                    // Remove / invalidate this token in your database
                                    await prisma.users.update({
                                        where: { user_id: i.user_id },
                                        data: { fcm_token: null }
                                    });
                                    console.warn(`Removed invalid FCM token for user ${i.user_id}`);
                                }
                            }
                        })()
                    }
                });


            }
        } catch (err) {
            if (err instanceof z.ZodError) {
                // Return validation errors
                return res.status(400).json({ error: err.errors });
            }
            // Other errors
            console.error(err);
            return res.status(500).json({ error: "Server Error" });
        }
    }

    ,
    // report notifications

    reportNotification: async (req, res) => {
        try {
            const { user_id } = req.body;
            if (!user_id) {
                return res.status(400).json({
                    message: "user_id are required"
                });
            }
            const lastRecepient = await prisma.notification_Recipients.findFirst({
                where: {
                    user_id: user_id
                },
                orderBy: {
                    created_at: "desc"
                }
            })
            const reporteduser = await prisma.users.findUnique({
                where: {
                    user_id: user_id
                }
            })
            console.log("reported user :", `${reporteduser.first_name} ${reporteduser.last_name}`)
            if (!lastRecepient) {
                return res.status(400).json({ message: "Notification not found" });
            }

            if (lastRecepient.delivery_status === DeliveryStatus.DELIVERED) {
                return res.status(400).json({ message: "Notification already reported" });
            }

            await prisma.notification_Recipients.update({
                where: {
                    id: lastRecepient.id
                },
                data: {
                    delivery_status: DeliveryStatus.DELIVERED
                }
            })
            return res.status(200).json({ message: "Notification reported successfully" });
        } catch (error) {
            console.error("reportNotification error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },


    // importEmployees: async (req, res) => {
    //     try {

    //         const users_to_be_added = req.body.users

    //         if (!users_to_be_added) {
    //             return res.status(400).json({ "message": "Users is required" })
    //         }


    //         if (!Array.isArray(users_to_be_added) || users_to_be_added.length === 0) {
    //             return res.status(400).json({ "message": "Users is not in correct format" })
    //         }

    //         const errors = []

    //         try {
    //             users_to_be_added.forEach((i, idx) => {

    //                 await prisma.users.create()
    //             })
    //         }
    //         catch (err) {
    //             errors.push(err)
    //         }
    //     }
    //     catch (err) {
    //         console.log(err)
    //     }
    // }






    // employee
    // get all contracting companies
    getAllContractingCompanies: async (req, res) => {

        try {


            const { organization_id } = req.query


            const contracting_companies = await prisma.contracting_Companies.findMany({
                where: {
                    organization_id: organization_id
                }
            })
            return res.json({ contracting_companies })
        }

        catch (err) {
            console.log(err










            )
            return res.status(500).json({ message: "Something went wrong", error: err })
        }
    },

    // create new contracting company
    createContractingCompany: async (req, res) => {
        try {
            const createContractingCompanySchema = z.object({
                organization_id: z.string({ required_error: "Organization id is required" }),
                name: z.string({ required_error: "Company name is required" }),
                address: z.string({ required_error: "Company address is required" }),
                contact_email: z
                    .string({ required_error: "Email is required" })
                    .email({ message: "Email is in invalid format" }),
                phone: z.string({ required_error: "Phone number is required" }),
            });

            const parsed = createContractingCompanySchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: parsed.error.flatten(),
                });
            }

            const { organization_id, name, contact_email, phone, address } = parsed.data;

            // --- check name ---
            const existingName = await prisma.contracting_Companies.findFirst({
                where: { organization_id, name },
            });
            if (existingName) {
                return res.status(409).json({
                    message: "A company with this name already exists.",
                });
            }

            // --- check email ---
            const existingEmail = await prisma.contracting_Companies.findFirst({
                where: { organization_id, contact_email },
            });
            if (existingEmail) {
                return res.status(409).json({
                    message: "A company with this email already exists.",
                });
            }

            // --- check phone ---
            const existingPhone = await prisma.contracting_Companies.findFirst({
                where: { organization_id, phone },
            });
            if (existingPhone) {
                return res.status(409).json({
                    message: "A company with this phone number already exists.",
                });
            }

            // --- create new company ---
            const contracting_company = await prisma.contracting_Companies.create({
                data: { organization_id, name, contact_email, phone, address },
            });

            return res.status(200).json({
                message: "Contracting company created successfully",
                contracting_company,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                message: "Something went wrong",
                error: err
            });
        }
    },

    // employee page overview

    // get all contracting companies of an organization
    getContractingCompanies: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            const contracting_companies = await prisma.contracting_Companies.findMany({
                where: { organization_id },
                select: {
                    id: true,
                    name: true,
                    contact_email: true,
                    phone: true,
                    address: true,
                    organization_id: true,
                    _count: {
                        select: {
                            contractors: {
                                where: {
                                    user: {
                                        is_active: true,
                                    },
                                },
                            },
                        },
                    },
                },
            });

            // Rename _count.contractors ➝ active_user_count for clarity
            const result = contracting_companies.map(company => ({
                ...company,
                active_user_count: company._count.contractors,
                _count: undefined, // remove raw _count object
            }));

            return res.json({ contracting_companies: result });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Something went wrong", error: err.message });
        }
    },
    // edit contracting company
    editContractingCompany: async (req, res) => {
        try {
            const { company_id, organization_id, name, contact_email, phone, address } = req.body;
            //   

            if (!company_id) {
                return res.status(400).json({ message: 'company_id is required' });
            }

            const data = {};
            if (organization_id) data.organization_id = organization_id.trim();
            if (name) data.name = name.trim();
            if (contact_email) data.contact_email = contact_email.trim().toLowerCase();
            if (phone) data.phone = phone.trim();
            if (address) data.address = address.trim();

            // if (Object.keys(data).length === 0) {
            //     return res.status(400).json({ message: 'Update is null' });
            // }

            const updated = await prisma.contracting_Companies.update({
                where: { id: company_id },
                data,
                select: {
                    id: true,
                    organization_id: true,
                    name: true,
                    contact_email: true,
                    phone: true,
                    address: true,
                },
            });

            return res.status(200).json({ message: 'Company updated', company: updated });
        } catch (err) {
            if (err?.code === 'P2025') {
                return res.status(404).json({ message: 'Company not found' });
            }
            console.error(err);
            return res.status(500).json({ message: 'Server error', error: err.message });
        }
    },
    // get active users of the contracting company
    getContractingActiveEmployees: async (req, res) => {
        try {
            const { organization_id, company_id } = req.query;

            if (!organization_id || !company_id) {
                return res.status(400).json({ message: "organization_id and company_id are required" });
            }

            // Check if the contracting company belongs to the organization
            const company = await prisma.contracting_Companies.findFirst({
                where: {

                    id: company_id,
                    organization_id,
                },
            });

            if (!company) {
                return res.status(404).json({ message: "Contracting company not found for the given organization" });
            }

            // Count active contractor users
            const active_user_count = await prisma.contractors.count({
                where: {
                    contracting_company_id: company_id,
                    user: {
                        is_active: true,
                    },
                },
            });

            return res.json({ active_user_count });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Something went wrong", error: err.message });
        }
    },





    // organization overview
    getOrganizationOverview: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            const [
                permanent_employees,
                contractors,
                pending_verifications,
            ] = await Promise.all([
                // ✅ Permanent employees (NOT contractors)
                prisma.users.count({
                    where: {
                        organization_id,
                        user_type: "employee",
                        is_active: true,
                    },
                }),

                // ✅ Contractors (separate table)
                prisma.contractors.count({
                    where: {
                        contracting_company: {
                            organization_id,
                        },
                        // (optional) if you have active flag in contractors table:
                        // is_active: true,
                    },
                }),

                // ✅ Pending verifications (all active users in org with phone not verified)
                prisma.users.count({
                    where: {
                        organization_id,
                        phone_verified: false,
                        is_active: true,
                    },
                }),
            ]);

            const total_employees = permanent_employees + contractors;

            return res.status(200).json({
                total_employees,        // ✅ permanent + contractors
                permanent_employees,    // ✅ employees only
                contractors,            // ✅ contractors only
                pending_verifications,
            });
        } catch (err) {
            console.error("getOrganizationOverview error:", err);
            return res.status(500).json({
                message: "Something went wrong",
                error: err.message,
            });
        }
    },


    getFilterValues: async (req, res) => {
        try {

            const org_id = req.query.organization_id;
            const sites = await prisma.sites.findMany({ where: { organization_id: org_id } })
            const roles = await prisma.roles.findMany()

            return res.json({ sites, roles })
        }
        catch (err) {
            console.log("Error occurred")
            return res.status(500).json({ message: "Something went wrong", error: err?.message })
        }
    },
    employeeDetails: async (req, res) => {


        try {
            // full name✅, organization_name✅, email✅ , phone ✅, is_phone_verfied ✅, role✅, site ✅ , area  ✅, alert history ✅
            // alert_history [array] : name , date , time , response_elasped_time, comment , status
            const { user_id } = req.query


            const check_user = await prisma.users.findUnique({ where: { user_id: user_id } })



            if (!check_user) {
                return res.status(401).json({ message: "User doesnt exist" })
            }

            const employee_details = await prisma.users.findUnique({ where: { user_id: user_id }, include: { organization: { select: { name: true } }, role: { select: { role_name: true } }, site: { select: { name: true } }, area: { select: { name: true } } } })
            const alert_history = await prisma.notification_Recipients.findMany({ where: { user_id: user_id }, include: { alert: { include: { emergency_type: true } } } })

            // if (alert_history) {
            const alert_data = alert_history.map(i => {
                const delivered_at = moment(i.delivered_at)
                const response_updated_at = alert_history.response_updated_at
                    ? moment(recipient.response_updated_at)
                    : null;

                let elapsed = null;
                if (delivered_at.isValid() && response_updated_at?.isValid()) {
                    elapsed = response_updated_at.diff(delivered_at, 'seconds');
                }
                return {

                    name: i.alert.emergency_type.name,
                    date: delivered_at.format('YYYY-MM-DD'),
                    time: delivered_at.format('HH:mm:ss'),
                    response_elapsed_time: elapsed,
                    message: i.alert.message,


                }
            })
            return res.json({ alert_history: alert_data, employee_details })
        }
        // }


        catch (err) {
            console.log(err)
            return res.json({ message: err.message })
        }
    },
    getEmployees: async (req, res) => {
        try {
            const {
                search = '',
                status = '',
                roles = '',
                sites = '',
                page = 1,
                limit = 20,
                organization_id
            } = req.query;
            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const take = parseInt(limit);

            const where = {
                organization_id,
                // Optional active/inactive status
                ...(status
                    ? { is_active: status === 'active' }
                    : {}),

                // Optional role filter
                ...(roles
                    ? { role_id: { in: roles.split(',') } }
                    : {}),

                // Optional site filter
                ...(sites
                    ? { site_id: { in: sites.split(',') } }
                    : {}),

                // Optional search filter (name, email, phone)
                ...(search
                    ? {
                        OR: [
                            { first_name: { contains: search, mode: 'insensitive' } },
                            { last_name: { contains: search, mode: 'insensitive' } },
                            { email: { contains: search, mode: 'insensitive' } },
                            { phone_number: { contains: search, mode: 'insensitive' } },
                        ],
                    }
                    : {}),
            };

            // Total count for pagination
            const total_count = await prisma.users.count({ where });

            const role_details = await prisma.roles.findMany({ select: { id: true, role_name: true } })
            const users = await prisma.users.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    is_active: true,
                    user_type: true,
                    phone_number: true,
                    site: {
                        select: {
                            name: true,
                        },
                    },
                    area: {
                        select: {
                            name: true,
                        },
                    },
                    role: {
                        select: {
                            role_name: true,
                            id: true
                        },
                    },
                    contractors: {
                        select: {
                            contracting_company: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            });

            const results = users.map(user => {
                const is_employee = user.user_type === 'employee';

                return {
                    user_id: user.user_id,
                    first_name: user.first_name,

                    last_name: user.last_name,
                    email: user.email,
                    status: user.is_active ? 'Active' : 'Inactive',
                    site_name: user.site?.name || null,
                    area_name: user.area?.name || null,
                    is_employee,
                    company_name: !is_employee ? user.contractors?.[0]?.contracting_company?.name || null : null,
                    phone: user.phone_number,
                    role: user.role?.role_name === 'admin' ? 'admin' : 'employee',
                    role_id: user?.role_id || null,
                    roles: role_details
                };
            });

            return res.status(200).json({
                total_count,
                employees: results,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                message: 'Something went wrong',
                error: err.message,
            });
        }
    },
    editEmployee: async (req, res) => {
        try {
            const {
                user_id,
                organization_id,
                first_name,
                last_name,
                email,
                phone,
                role_id,
                site_id,
                area_id,
                user_type,        // "EMPLOYEE" or "CONTRACTOR"
                company_id        // required if user_type is CONTRACTOR
            } = req.body;

            console.log("Incoming body:", req.body);

            if (!user_id) return res.status(400).json({ message: "user id is required" });
            if (!organization_id) return res.status(400).json({ message: "organization id is required" });

            const user = await prisma.users.findUnique({ where: { user_id } });
            if (!user) return res.status(404).json({ message: "User not found" });

            // Check if new email is already in use
            if (email && email.toLowerCase() !== user.email.toLowerCase()) {
                const existing = await prisma.users.findUnique({ where: { email: email.toLowerCase() } });
                if (existing) return res.status(409).json({ message: "Email is already in use" });
            }

            // Check if role exists if passed
            if (role_id) {
                const roleExists = await prisma.roles.findUnique({ where: { id: role_id } });
                if (!roleExists) return res.status(400).json({ message: "Invalid role_id" });
            }

            // Build update data dynamically
            const updates = {};
            if (first_name) updates.first_name = first_name;
            if (last_name) updates.last_name = last_name;
            if (email) updates.email = email.toLowerCase();
            if (phone) updates.phone_number = phone;
            if (role_id) updates.role_id = role_id;
            if (site_id) updates.site_id = site_id;
            if (area_id) updates.area_id = area_id;
            if (user_type) updates.user_type = user_type;
            console.log(updates, "updates")


            // Handle user_type change (EMPLOYEE <-> CONTRACTOR)
            if (user_type && user.user_type !== user_type) {
                if (user_type === "employee") {
                    await prisma.contractors.deleteMany({ where: { user_id } });
                    await prisma.employees.create({ data: { user_id } });
                } else if (user_type === "contractor") {
                    if (!company_id) return res.status(400).json({ message: "company_id is required for contractors" });
                    await prisma.employees.deleteMany({ where: { user_id } });
                    await prisma.contractors.create({
                        data: {
                            user_id,
                            contracting_company_id: company_id,
                        },
                    });
                } else {
                    return res.status(400).json({ message: "Invalid user_type" });
                }
            }

            const updatedUser = await prisma.users.update({
                where: { user_id },
                data: updates,
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone_number: true,
                    user_type: true,
                    role: { select: { role_name: true } },
                },
            });

            return res.status(200).json({
                message: "User updated successfully",
                user: {
                    id: updatedUser.user_id,
                    name: `${updatedUser.first_name} ${updatedUser.last_name}`.trim(),
                    email: updatedUser.email,
                    phone: updatedUser.phone_number,
                    role: updatedUser.role?.role_name,
                    type: updatedUser.user_type,
                },
            });
        } catch (error) {
            console.error("editEmployee error:", error);
            return res.status(500).json({ message: "Server error" });
        }
    }
    ,


    deleteContractingCompany: async (req, res) => {
        try {
            const { organization_id, company_id } = req.body;

            if (!company_id) {
                return res.status(400).json({ message: "contracting_company_id is required" });
            }
            const contracting_company = await prisma.contracting_Companies.findUnique({ where: { id: company_id, organization_id } });
            console.log(contracting_company)
            if (!contracting_company) {
                return res.status(400).json({ message: "Contracting company not found" });
            }

            await prisma.contracting_Companies.delete({ where: { id: company_id } });

            return res.status(200).json({ message: "Contracting company deleted successfully" });
        } catch (error) {
            console.error("deleteContractingCompany error:", error);
            return res.status(500).json({ message: "Server error" });
        }
    },

    // deactivate employee
    deactivateEmployee: async (req, res) => {
        try {
            const { user_id } = req.body;

            if (!user_id) {
                return res.status(400).json({ message: "user_id is required" });
            }

            // Check if user exists
            const user = await prisma.users.findUnique({ where: { user_id } });

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            // Deactivate user
            await prisma.users.update({
                where: { user_id },
                data: { is_active: false },
            });

            return res.status(200).json({ message: "User deactivated successfully" });
        } catch (error) {
            console.error("deactivateEmployee error:", error);
            return res.status(500).json({ message: "Server error" });
        }
    }


    // sites
    , getSitesCards: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ error: 'organization_id is required' });
            }

            // Run counts in parallel for speed
            const [total_sites, active_sites, total_areas, current_occupancy] = await Promise.all([
                prisma.sites.count({
                    where: { organization_id },
                }),
                prisma.sites.count({
                    where: { organization_id, is_active: true },
                }),
                prisma.areas.count({
                    where: {
                        site: { organization_id },
                    },
                }),
                prisma.users.count({
                    where: {
                        organization_id,
                        is_active: true,
                    },
                }),
            ]);

            return res.json({
                total_sites,
                active_sites,        // ✅ new field
                total_areas,
                current_occupancy,
            });
        } catch (error) {
            console.error('getSitesCards error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
            });
        }
    },

    // searchSites: async (req, res) => {
    //     try {
    //         const {
    //             organization_id,
    //             name,
    //             status,
    //             address,
    //             page = '1',
    //             page_size = '10',
    //             sort_by = 'name',
    //             sort_order = 'asc',
    //         } = req.query;

    //         const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    //         const pageSizeNum = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 100);
    //         const skip = (pageNum - 1) * pageSizeNum;
    //         const take = pageSizeNum;

    //         // ---- Build WHERE ----
    //         const where = {};

    //         if (organization_id) {
    //             where.organization_id = organization_id;
    //         }

    //         if (name && name.trim()) {
    //             where.name = {
    //                 startsWith: name.trim(),
    //                 mode: 'insensitive',
    //             };
    //         }

    //         if (address && address.trim()) {
    //             const needle = address.trim();
    //             where.OR = [
    //                 { address_line_1: { contains: needle, mode: 'insensitive' } },
    //                 { address_line_2: { contains: needle, mode: 'insensitive' } },
    //                 { city: { contains: needle, mode: 'insensitive' } },
    //                 { state: { contains: needle, mode: 'insensitive' } },
    //                 { zip_code: { contains: needle, mode: 'insensitive' } },
    //             ];
    //         }

    //         // Status filter: interpret as "site is active if it has at least one active user"
    //         if (status) {
    //             const normalized = String(status).toLowerCase();
    //             if (normalized === 'active') {
    //                 where.Users = { some: { is_active: true } };
    //             } else if (normalized === 'inactive') {
    //                 where.Users = { none: { is_active: true } };
    //             } else {
    //                 return res.status(400).json({ error: "Invalid status. Use 'active' or 'inactive'." });
    //             }
    //         }

    //         // ---- Sorting ----
    //         const sortFields = new Set(['name', 'created_at', 'city', 'state']);
    //         const orderBy = sortFields.has(String(sort_by)) ? { [sort_by]: sort_order === 'desc' ? 'desc' : 'asc' }
    //             : { name: 'asc' };

    //         // ---- Total for pagination ----
    //         const [total] = await Promise.all([
    //             prisma.sites.count({ where }),
    //         ]);

    //         if (total === 0) {
    //             return res.json({
    //                 data: [],
    //                 meta: { page: pageNum, page_size: pageSizeNum, total: 0 },
    //             });
    //         }

    //         // ---- Fetch page of sites + raw counts (_count gives totals) ----
    //         const sites = await prisma.sites.findMany({
    //             where,
    //             orderBy,
    //             skip,
    //             take,
    //             select: {
    //                 id: true,
    //                 organization_id: true,
    //                 name: true,
    //                 address_line_1: true,
    //                 address_line_2: true,
    //                 city: true,
    //                 state: true,
    //                 zip_code: true,
    //                 contact_name: true,
    //                 contact_email: true,
    //                 contact_phone: true,
    //                 created_at: true,
    //                 _count: {
    //                     select: {
    //                         Users: true, // total users (any status)
    //                         Areas: true, // total areas
    //                     },
    //                 },
    //             },
    //         });

    //         const siteIds = sites.map(s => s.id);

    //         // ---- Active users per site (filtered count) via groupBy to avoid N+1 ----
    //         // If there are no sites in the page, skip.
    //         let activeCountsMap = {};
    //         if (siteIds.length > 0) {
    //             const activeCounts = await prisma.users.groupBy({
    //                 by: ['site_id'],
    //                 where: {
    //                     site_id: { in: siteIds },
    //                     is_active: true,
    //                 },
    //                 _count: { _all: true },
    //             });
    //             activeCountsMap = activeCounts.reduce((acc, row) => {
    //                 acc[row.site_id] = row._count._all;
    //                 return acc;
    //             }, {});
    //         }

    //         // ---- Shape the response ----
    //         const data = sites.map(s => ({
    //             id: s.id,
    //             name: s.name,
    //             address_line_1: s.address_line_1,
    //             address_line_2: s.address_line_2,
    //             city: s.city,
    //             state: s.state,
    //             zip_code: s.zip_code,
    //             contact_name: s.contact_name,
    //             contact_email: s.contact_email,
    //             contact_phone: s.contact_phone,
    //             counts: {
    //                 total_users: s._count.Users,
    //                 active_users: activeCountsMap[s.id] || 0,
    //                 total_areas: s._count.Areas,
    //             },
    //         }));

    //         return res.json({
    //             data,
    //             meta: { page: pageNum, page_size: pageSizeNum, total },
    //         });
    //     } catch (error) {
    //         console.error('searchSites error:', error);
    //         return res.status(500).json({
    //             error: 'Internal server error',
    //             details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    //         });
    //     }
    // },

    // create site
    searchSites: async (req, res) => {
        try {
            const {
                organization_id,
                name = '',
                status,              // allow default 'all'
                page = '1',
                page_size = '10',
            } = req.query;

            if (!organization_id) {
                return res.status(400).json({ error: 'organization_id is required' });
            }

            const normalizedStatus = String(status).toLowerCase();
            const allowed = ['active', 'inactive', 'all'];
            if (!allowed.includes(normalizedStatus)) {
                return res
                    .status(400)
                    .json({ error: "Invalid status. Must be 'active', 'inactive', or 'all'." });
            }

            const pageNum = Math.max(parseInt(page, 10) || 1, 1);
            const pageSizeNum = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 100);
            const skip = (pageNum - 1) * pageSizeNum;
            const take = pageSizeNum;

            // ---- Build WHERE ----
            const where = {
                organization_id,
                ...(normalizedStatus !== 'all' && {
                    is_active: normalizedStatus === 'active',
                }),
                ...(name.trim() && {
                    name: { contains: name.trim(), mode: 'insensitive' },
                }),
            };

            // ---- Count ----
            const total = await prisma.sites.count({ where });

            if (total === 0) {
                return res.json({
                    data: [],
                    meta: { page: pageNum, page_size: pageSizeNum, total: 0 },
                });
            }

            // ---- Fetch sites ----
            const sites = await prisma.sites.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' }, // newest first
                select: {
                    id: true,
                    name: true,
                    is_active: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    _count: {
                        select: {
                            Users: true,
                            Areas: true,
                        },
                    },
                },
            });

            // ---- Shape response ----
            const data = sites.map((s) => ({
                id: s.id,
                name: s.name,
                address: [s.address_line_1, s.address_line_2, s.city, s.state, s.zip_code]
                    .filter(Boolean)
                    .join(', '),
                total_people: s._count.Users,
                total_areas: s._count.Areas,
                status: s.is_active ? 'active' : 'inactive',
            }));

            return res.json({
                data,
                meta: { page: pageNum, page_size: pageSizeNum, total },
            });
        } catch (error) {
            console.error('searchSites error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
            });
        }
    }
    ,

    createSite: async (req, res) => {
        try {

            console.log("Create called")
            const phoneRegex = /^\+?[1-9]\d{7,14}$/;
            const CreateSiteSchema = z.object({
                organization_id: z.string().uuid("organization_id must be a valid UUID"),

                // Site fields (match your controller naming)
                site_name: z.string().trim().min(1, "site_name is required").max(255),
                address: z.string().trim().min(1, "address is required"),
                address_line_2: z
                    .string()
                    .trim()
                    .optional()
                    .nullable()
                    .transform((v) => (v ?? undefined)),
                city: z.string().trim().min(1, "city is required"),
                state: z.string().trim().min(1, "state is required"),
                zipcode: z.string().trim().min(3).max(12),

                // Contact fields
                site_contact_name: z.string().trim().min(1, "site_contact_name is required"),
                contact_email: z.string().email().transform((s) => s.toLowerCase()),
                contact_phone: z
                    .string()
                    .trim()
                    .regex(phoneRegex, "contact_phone must be a valid phone number")
                    .optional()
                    .nullable()
                    .transform((v) => (v ?? undefined)),
            });
            const parsed = CreateSiteSchema.parse(req.body);

            // ✅ create site
            const site = await prisma.sites.create({
                data: {
                    organization_id: parsed.organization_id,
                    name: parsed.site_name,
                    address_line_1: parsed.address,
                    address_line_2: parsed.address_line_2 ?? null,
                    city: parsed.city,
                    state: parsed.state,
                    zip_code: parsed.zipcode,
                    contact_name: parsed.site_contact_name,
                    contact_email: parsed.contact_email,
                    contact_phone: parsed.contact_phone ?? null,
                },
            });

            // ✅ if areas exist, create them
            if (parsed.areas && parsed.areas.length > 0) {
                await prisma.areas.createMany({
                    data: parsed.areas.map((a) => ({
                        site_id: site.id,
                        name: a.name,
                        description: a.description ?? null,
                    })),
                });
            }

            // ✅ return site with Areas (no alert_sites anymore)
            const siteWithAreas = await prisma.sites.findUnique({
                where: { id: site.id },
                include: { Areas: true },
            });

            return res.status(201).json(siteWithAreas);
        } catch (error) {
            if (error.name === 'ZodError') {
                return res.status(400).json({ error: error.errors });
            }
            console.error('createSite error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    createArea: async (req, res) => {
        try {
            const CreateAreaSchema = z.object({
                name: z.string().trim().min(1, "Area name is required").max(255),
                site_id: z.string().uuid("site_id must be a valid UUID"),
                description: z
                    .string()
                    .trim()
                    .max(1000, "Description too long")
                    .optional()
                    .nullable()
                    .transform((v) => (v ?? undefined)),
            });
            const parsed = CreateAreaSchema.parse(req.body);

            // ✅ check if site exists
            const site = await prisma.sites.findUnique({
                where: { id: parsed.site_id },
                select: { id: true },
            });

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // ✅ create area
            const area = await prisma.areas.create({
                data: {
                    site_id: parsed.site_id,
                    name: parsed.name,
                    description: parsed.description ?? null,
                },
            });

            return res.status(200).json(area);
        } catch (error) {
            if (error.name === 'ZodError') {
                return res.status(400).json({ error: error.errors });
            }
            console.error('createArea error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
    ,
    siteOverview: async (req, res) => {
        try {
            const { site_id } = req.query;

            if (!site_id) {
                return res.status(400).json({ error: 'site_id is required' });
            }

            // fetch site + areas + user counts
            const site = await prisma.sites.findUnique({
                where: { id: site_id },
                select: {
                    id: true,
                    name: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    Areas: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            _count: {
                                select: { Users: true },
                            },
                        },
                        orderBy: { name: 'asc' },
                    },
                },
            });

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // === Parallel counts ===
            const [employeesCount, contractorsCount, adminsCount] = await Promise.all([
                prisma.employees.count({ where: { user: { site_id } } }),
                prisma.contractors.count({ where: { user: { site_id } } }),
                prisma.users.count({
                    where: {
                        site_id,
                        role: { role_name: { equals: 'admin', mode: 'insensitive' } },
                    },
                }),
            ]);

            // optional: users not assigned to any area
            const unassignedUsers = await prisma.users.findMany({
                where: { site_id, area_id: null },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    phone_number: true,
                    is_active: true,
                    user_type: true,
                },
                orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
            });

            return res.json({
                site_name: site.name,
                address: [
                    site.address_line_1,
                    site.address_line_2,
                    site.city,
                    site.state,
                    site.zip_code,
                ]
                    .filter(Boolean)
                    .join(', '),
                employees: employeesCount,
                contractors: contractorsCount,
                admins: adminsCount, // ✅ added field
                areas: site.Areas.map((a) => ({
                    id: a.id,
                    name: a.name,
                    description: a.description,
                    user_count: a._count.Users,
                })),
                unassigned_users: unassignedUsers,
            });
        } catch (error) {
            console.error('siteOverview error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                details:
                    process.env.NODE_ENV === 'development' ? String(error) : undefined,
            });
        }
    }

    ,
    updateArea: async (req, res) => {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({ error: 'Area id is required' });
            }

            const { name, description } = req.body;

            // ✅ check if area exists
            const area = await prisma.areas.findUnique({ where: { id } });
            if (!area) {
                return res.status(404).json({ error: 'Area not found' });
            }

            // ✅ update area
            const updated = await prisma.areas.update({
                where: { id },
                data: {
                    name: name ?? area.name,
                    description: description ?? area.description,
                },
            });

            return res.status(200).json({
                message: 'Area updated successfully',
                data: updated,
            });
        } catch (error) {
            console.error('updateArea error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                details:
                    process.env.NODE_ENV === 'development' ? String(error) : undefined,
            });
        }
    }
    ,
    deleteArea: async (req, res) => {
        try {
            const { site_id, area_id } = req.params;

            if (!site_id || !area_id) {
                return res.status(400).json({ error: 'site_id and area_id are required' });
            }

            // ✅ check if area exists under the site
            const area = await prisma.areas.findFirst({
                where: { id: area_id, site_id },
            });

            if (!area) {
                return res.status(404).json({ error: 'Area not found for the given site' });
            }

            // ✅ delete area
            await prisma.areas.delete({
                where: { id: area_id },
            });

            return res.status(200).json({
                message: 'Area deleted successfully',
                deleted_area_id: area_id,
            });
        } catch (error) {
            console.error('deleteArea error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                details:
                    process.env.NODE_ENV === 'development' ? String(error) : undefined,
            });
        }
    }


    // sites popup overview
    , sitePopupOverview: async (req, res) => {
        try {
            const { site_id } = req.query;

            if (!site_id) {
                return res.status(400).json({ error: 'site_id is required' });
            }

            // ✅ fetch basic site info with counts
            const site = await prisma.sites.findUnique({
                where: { id: site_id },
                select: {
                    id: true,
                    name: true,
                    is_active: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    contact_name: true,
                    contact_email: true,
                    _count: {
                        select: {
                            Users: true,
                            Areas: true,
                            Alert_Sites: true,
                        },
                    },
                },
            });

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            // ✅ average response time
            // join: Alert_Sites → Alerts → Notification_Recipients
            const responses = await prisma.notification_Recipients.findMany({
                where: {
                    alert: {
                        Alert_Sites: {
                            some: { site_id },
                        },
                    },
                    response_updated_at: { not: null },
                },
                select: {
                    created_at: true,
                    response_updated_at: true,
                },
            });

            let avgResponseTime = null;
            if (responses.length > 0) {
                const diffs = responses.map(r =>
                    (r.response_updated_at - r.created_at) / 1000 // seconds
                );
                avgResponseTime = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            }

            // ✅ shape response
            return res.json({
                site_name: site.name,
                status: site.is_active ? 'active' : 'inactive',
                current_count: site._count.Users,
                areas: site._count.Areas,
                total_alerts: site._count.Alert_Sites,
                average_response_time: avgResponseTime, // in seconds
                address: [site.address_line_1, site.address_line_2, site.city, site.state, site.zip_code]
                    .filter(Boolean)
                    .join(', '),
                contact_name: site.contact_name,
                contact_email: site.contact_email,
            });
        } catch (error) {
            console.error('sitePopupOverview error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
    ,
    sitePopupAreas: async (req, res) => {
        try {
            const { site_id } = req.query;

            if (!site_id) {
                return res.status(400).json({ error: 'site_id is required' });
            }

            // ✅ fetch site and its areas
            const site = await prisma.sites.findUnique({
                where: { id: site_id },
                select: {
                    id: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    Areas: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            const fullAddress = [
                site.address_line_1,
                site.address_line_2,
                site.city,
                site.state,
                site.zip_code,
            ]
                .filter(Boolean)
                .join(', ');

            // ✅ build response for each area
            const areasData = await Promise.all(
                site.Areas.map(async (area) => {
                    const employees = await prisma.employees.count({
                        where: { user: { area_id: area.id } },
                    });

                    const contractors = await prisma.contractors.count({
                        where: { user: { area_id: area.id } },
                    });

                    return {
                        area_name: area.name,
                        address: fullAddress,
                        num_employees: employees,
                        num_contractors: contractors,
                        route: area.id, // 👈 returning route as area_id (frontend can use this)
                    };
                })
            );

            return res.status(200).json(areasData);
        } catch (error) {
            console.error('sitePopupAreas error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    sitePopupAreas: async (req, res) => {
        try {
            const { site_id } = req.query;

            if (!site_id) {
                return res.status(400).json({ error: 'site_id is required' });
            }

            // ✅ fetch site and its areas
            const site = await prisma.sites.findUnique({
                where: { id: site_id },
                select: {
                    id: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    Areas: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            const fullAddress = [
                site.address_line_1,
                site.address_line_2,
                site.city,
                site.state,
                site.zip_code,
            ]
                .filter(Boolean)
                .join(', ');

            // ✅ build response for each area
            const areasData = await Promise.all(
                site.Areas.map(async (area) => {
                    const employees = await prisma.employees.count({
                        where: { user: { area_id: area.id } },
                    });

                    const contractors = await prisma.contractors.count({
                        where: { user: { area_id: area.id } },
                    });

                    return {
                        area_name: area.name,
                        address: fullAddress,
                        num_employees: employees,
                        num_contractors: contractors,
                        route: area.id, // 👈 returning route as area_id (frontend can use this)
                    };
                })
            );

            return res.status(200).json(areasData);
        } catch (error) {
            console.error('sitePopupAreas error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    sitePopupEmployees: async (req, res) => {
        try {
            const { site_id } = req.query;
            if (!site_id) {
                return res.status(400).json({ error: 'site_id is required' });
            }

            // Fetch site to build address once
            const site = await prisma.sites.findUnique({
                where: { id: site_id },
                select: {
                    id: true,
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                },
            });
            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }

            const areaAddress = [
                site.address_line_1,
                site.address_line_2,
                site.city,
                site.state,
                site.zip_code,
            ].filter(Boolean).join(', ');

            // Get users at this site who are employees
            const users = await prisma.users.findMany({
                where: {
                    site_id,
                    // only employees (has related Employees row)
                    employee: { isNot: null },
                },
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    area: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: { first_name: 'asc' },
            });

            const employees = users.map(u => ({
                user_id: u.user_id,
                first_name: u.first_name,
                last_name: u.last_name,
                area_name: u.area?.name || null,
                area_address: areaAddress,
            }));

            return res.status(200).json(employees);
        } catch (error) {
            console.error('sitePopupEmployees error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },
    getSitePopupAlerts: async (req, res) => {
        try {
            const { site_id } = req.query;
            if (!site_id) {
                return res.status(400).json({ error: "site_id is required" });
            }

            // Fetch alerts for this site with areas + recipients
            const alerts = await prisma.alerts.findMany({
                where: {
                    Alert_Sites: {
                        some: { site_id }
                    }
                },
                include: {
                    Alert_Areas: {
                        include: {
                            area: true
                        }
                    },
                    Notification_Recipients: true,
                    emergency_type: true,
                },
                orderBy: { created_at: 'desc' }
            });

            const response = alerts.map(alert => {
                // counts
                const safeCount = alert.Notification_Recipients.filter(r => r.response === "SAFE").length;
                const unsafeCount = alert.Notification_Recipients.filter(r => r.response === "NOT_SAFE").length;
                const notRespondedCount = alert.Notification_Recipients.filter(r => !r.response).length;

                // duration (minutes)
                let duration = null;
                if (alert.start_time && alert.end_time) {
                    duration = differenceInMinutes(new Date(alert.end_time), new Date(alert.start_time));
                }

                return {
                    alert_id: alert.id,
                    name: alert.message || alert.emergency_type?.name,
                    status: alert.status,
                    start_time: alert.start_time,
                    duration_minutes: duration,
                    areas: alert.Alert_Areas.map(a => ({
                        name: a.area.name,
                        address: a.area.description
                    })),
                    counts: {
                        safe: safeCount,
                        unsafe: unsafeCount,
                        not_responded: notRespondedCount
                    }
                };
            });

            res.json(response);
        } catch (error) {
            console.error("Error in getSitePopupAlerts:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    // GET /admin/alert-history?organization_id=...&page=1
    // Returns: { data: [...], meta: { page, per_page, total, total_pages } }
    // ✅ Fixed: getAlertHistory with string comparisons
    getAlertHistory: async (req, res) => {
        try {
            const { organization_id } = req.query;
            const page = Number(req.query.page || 1);
            const take = Number(req.query.per_page || 10);
            const skip = (page - 1) * take;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // ✅ Only resolved alerts for history
            const whereResolved = {
                organization_id: String(organization_id),
                AND: [
                    { status: "resolved" },         // enum AlertStatus.resolved
                    { resolved_at: { not: null } }, // safety
                ],
                // Optional: ensure it truly ended
                // end_time: { not: null },
            };

            const total = await prisma.alerts.count({
                where: whereResolved,
            });

            const alerts = await prisma.alerts.findMany({
                where: whereResolved,
                orderBy: [{ resolved_at: "desc" }, { end_time: "desc" }, { created_at: "desc" }],
                skip,
                take,
                select: {
                    id: true,
                    message: true,
                    severity: true,
                    start_time: true,
                    end_time: true,
                    resolved_at: true,
                    resolution_notes: true,
                    resolution_reason: {
                        select: {
                            reason_code: true,
                            reason_description: true,
                        },
                    },
                    emergency_type: { select: { name: true } },
                    Notification_Recipients: { select: { response: true } },
                },
            });

            const data = alerts.map((a) => {
                const recipients = a.Notification_Recipients || [];
                let safe = 0;
                let needHelp = 0;
                let emergency = 0;

                for (const r of recipients) {
                    switch (r.response) {
                        case "safe":
                            safe++;
                            break;
                        case "seeking_shelter":
                        case "need_help":
                            needHelp++;
                            break;
                        case "not_safe":
                        case "evacuated":
                        case "emergency_help_needed":
                            emergency++;
                            break;
                        default:
                            break; // null/undefined = not responded
                    }
                }

                const notResponded = Math.max(0, recipients.length - (safe + needHelp + emergency));

                return {
                    id: a.id,
                    emergency_type: a.emergency_type?.name ?? null,
                    message: a.message,
                    severity: a.severity,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    resolved_at: a.resolved_at,
                    resolution_reason: a.resolution_reason
                        ? {
                            code: a.resolution_reason.reason_code,
                            description: a.resolution_reason.reason_description,
                        }
                        : null,
                    resolution_notes: a.resolution_notes ?? null,

                    safe_responded_count: safe,
                    need_help_count: needHelp,
                    emergency_count: emergency,
                    not_responded_count: notResponded,
                };
            });

            return res.status(200).json({
                data,
                meta: {
                    page,
                    per_page: take,
                    total,
                    total_pages: Math.ceil(total / take),
                },
            });
        } catch (error) {
            console.error("getAlertHistory error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },


    getScheduledAlerts: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // Fetch all alerts with status = "scheduled"
            const scheduledAlerts = await prisma.alerts.findMany({
                where: {
                    organization_id,
                    status: "scheduled",
                },
                orderBy: [{ scheduled_time: "desc" }],
                select: {
                    id: true,
                    message: true,
                    severity: true,
                    start_time: true,
                    end_time: true,
                    scheduled_time: true,
                    emergency_type: {
                        select: { name: true },
                    },
                    Notification_Recipients: {
                        select: { response: true },
                    },
                },
            });

            // Transform response
            const data = scheduledAlerts.map((alert) => ({
                id: alert.id,
                emergency_type: alert.emergency_type ? alert.emergency_type.name : null,
                message: alert.message,
                severity: alert.severity,
                scheduled_time: alert.scheduled_time,
                start_time: alert.start_time,
                end_time: alert.end_time,
                total_recipients: alert.Notification_Recipients.length,
            }));

            return res.status(200).json({
                total: data.length,
                data,
            });
        } catch (error) {
            console.error("getScheduledAlerts error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    // site analytics page
    // ==============================
    // 🆕 Get Site Analytics Card
    // ==============================
    getSiteAnalyticsCard: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // === Total Alerts ===
            const total_alerts = await prisma.alerts.count({
                where: { organization_id },
            });

            // === Average Response Time ===
            const responses = await prisma.notification_Recipients.findMany({
                where: {
                    alert: { organization_id },
                    acknowledged_at: { not: null },
                },
                select: {
                    acknowledged_at: true,
                    created_at: true,
                },
            });

            let avg_response_time = null;

            if (responses.length > 0) {
                const total_ms = responses.reduce((sum, r) => {
                    const diff = new Date(r.acknowledged_at) - new Date(r.created_at);
                    return sum + diff;
                }, 0);

                // convert to minutes instead of seconds
                const avg_ms = total_ms / responses.length;
                const avg_minutes = avg_ms / (1000 * 60);
                avg_response_time = avg_minutes.toFixed(2); // minutes with 2 decimals
            }

            return res.status(200).json({
                organization_id,
                total_alerts,
                avg_response_time: avg_response_time ? `${avg_response_time} min` : "N/A",
            });
        } catch (error) {
            console.error("getSiteAnalyticsCard error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },

    // =====================================
    // 🆕 Get Site Performance (Organization-wide)
    // =====================================
    /**
    * GET /get-site-performance
    * Query: organization_id (required), page=1, page_size=10
    * Returns paginated site performance:
    *  - site_name
    *  - num_of_alerts
    *  - total_people
    *  - performance (% = unique responders across alerts / total_people)
    */
    getSitePerformance: async (req, res) => {
        try {
            const { organization_id } = req.query;
            let { page = "1", page_size = "10" } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // Normalize pagination params
            const pageNum = Math.max(parseInt(page, 10) || 1, 1);
            const pageSizeNum = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 100); // cap to 100

            // Total sites (for meta)
            const total_sites = await prisma.sites.count({
                where: { organization_id },
            });

            const total_pages = Math.max(Math.ceil(total_sites / pageSizeNum), 1);
            const skip = (pageNum - 1) * pageSizeNum;

            // Page of sites with counts (avoids extra queries for users/alerts count)
            const sitesPage = await prisma.sites.findMany({
                where: { organization_id },
                orderBy: { created_at: "desc" },         // adjust ordering if needed
                skip,
                take: pageSizeNum,
                select: {
                    id: true,
                    name: true,
                    _count: {
                        select: {
                            Users: true,        // total_people
                            Alert_Sites: true,  // num_of_alerts (links to alerts)
                        },
                    },
                },
            });

            // If no sites in this page
            if (sitesPage.length === 0) {
                return res.status(200).json({
                    organization_id,
                    pagination: {
                        page: pageNum,
                        page_size: pageSizeNum,
                        total_sites,
                        total_pages,
                        has_prev: pageNum > 1,
                        has_next: pageNum < total_pages,
                    },
                    site_performance: [],
                });
            }

            // Collect site ids for this page
            const siteIds = sitesPage.map(s => s.id);

            // Map site_id -> alert_ids (batched)
            const alertLinks = await prisma.alert_Sites.findMany({
                where: { site_id: { in: siteIds } },
                select: { site_id: true, alert_id: true },
            });

            const siteToAlertIds = new Map();  // site_id -> Set(alert_id)
            const alertIdToSiteId = new Map(); // alert_id -> site_id (for back mapping)
            for (const { site_id, alert_id } of alertLinks) {
                if (!siteToAlertIds.has(site_id)) siteToAlertIds.set(site_id, new Set());
                siteToAlertIds.get(site_id).add(alert_id);
                // If an alert is linked to multiple sites, last one wins – but we only need site-level aggregation.
                // We’ll instead aggregate per-site using siteToAlertIds below, so this map is optional.
                alertIdToSiteId.set(alert_id, site_id);
            }

            // Collect all alert ids on this page of sites
            const allAlertIds = [...new Set(alertLinks.map(a => a.alert_id))];

            // Fetch responders for those alert ids (response not null) in one query
            // We will aggregate unique responders per site in JS
            let responders = [];
            if (allAlertIds.length > 0) {
                responders = await prisma.notification_Recipients.findMany({
                    where: {
                        alert_id: { in: allAlertIds },
                        response: { not: null },
                    },
                    select: {
                        alert_id: true,
                        user_id: true,
                    },
                });
            }

            // Build site_id -> Set(user_id) of responders (unique per site)
            const siteToResponderSet = new Map();
            for (const r of responders) {
                const siteId = alertIdToSiteId.get(r.alert_id);
                if (!siteId) continue;
                if (!siteToResponderSet.has(siteId)) siteToResponderSet.set(siteId, new Set());
                siteToResponderSet.get(siteId).add(r.user_id);
            }

            // Final shaping
            const site_performance = sitesPage.map(site => {
                const total_people = site._count.Users || 0;
                const num_of_alerts = site._count.Alert_Sites || 0;

                const uniqueResponders = siteToResponderSet.get(site.id)?.size || 0;
                const performancePct =
                    total_people > 0 ? ((uniqueResponders / total_people) * 100).toFixed(2) : "0.00";

                return {
                    site_name: site.name,
                    num_of_alerts,
                    total_people,
                    performance: `${performancePct}%`,
                };
            });

            return res.status(200).json({
                organization_id,
                pagination: {
                    page: pageNum,
                    page_size: pageSizeNum,
                    total_sites,
                    total_pages,
                    has_prev: pageNum > 1,
                    has_next: pageNum < total_pages,
                },
                site_performance,
            });
        } catch (error) {
            console.error("getSitePerformance error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    /**
  * GET /get-alert-distribution?organization_id=xxx
  * Returns: list of { alert_type_id, alert_type, count }
  * - Includes types with zero alerts for this org
  */
    getAlertDistribution: async (req, res) => {
        try {
            const { organization_id } = req.query;
            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // 1) Fetch all Emergency Types for this org
            const types = await prisma.emergency_Types.findMany({
                where: { organization_id },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            });

            if (types.length === 0) {
                return res.status(200).json({
                    organization_id,
                    total_alerts: 0,
                    alert_types: [],              // labels
                    alert_type_count: [],         // counts aligned with labels
                    distribution: [],             // [{ alert_type_id, alert_type, count }]
                });
            }

            const typeIds = types.map(t => t.id);

            // 2) Group Alerts by emergency_type_id for this org
            const grouped = await prisma.alerts.groupBy({
                by: ["emergency_type_id"],
                where: {
                    organization_id,
                    emergency_type_id: { in: typeIds },
                },
                _count: { _all: true },
            });

            // 3) Build a map for quick lookup
            const countMap = new Map(grouped.map(g => [g.emergency_type_id, g._count._all]));

            // 4) Materialize full distribution (including zero-count types)
            const distribution = types.map(t => ({
                alert_type_id: t.id,
                alert_type: t.name,
                count: countMap.get(t.id) ?? 0,
            }));

            // Optional: sort by count desc for nicer charts
            distribution.sort((a, b) => b.count - a.count);



            return res.status(200).json({
                organization_id,
                distribution,       // detailed objects
            });
        } catch (error) {
            console.error("getAlertDistribution error:", error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    },
    getResponseTimeTrend: async (req, res) => {
        try {
            const { organization_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ message: "organization_id is required" });
            }

            // 1️⃣ Fetch all sites of the organization
            const sites = await prisma.sites.findMany({
                where: { organization_id },
                select: { id: true, name: true },
            });

            if (sites.length === 0) {
                return res.status(200).json({
                    organization_id,
                    unit: "minutes",
                    data: [],
                });
            }

            const siteIds = sites.map((s) => s.id);

            // 2️⃣ Get all alert-site links
            const alertLinks = await prisma.alert_Sites.findMany({
                where: { site_id: { in: siteIds } },
                select: { site_id: true, alert_id: true },
            });

            // Build map: site_id -> alert_ids[]
            const siteToAlertIds = new Map();
            for (const { site_id, alert_id } of alertLinks) {
                if (!siteToAlertIds.has(site_id)) siteToAlertIds.set(site_id, new Set());
                siteToAlertIds.get(site_id).add(alert_id);
            }

            const allAlertIds = [...new Set(alertLinks.map((a) => a.alert_id))];

            if (allAlertIds.length === 0) {
                return res.status(200).json({
                    organization_id,
                    unit: "minutes",
                    data: sites.map((s) => ({
                        site_name: s.name,
                        average_response_time: null,
                    })),
                });
            }

            // 3️⃣ Fetch acknowledged recipients for those alerts
            const recipients = await prisma.notification_Recipients.findMany({
                where: {
                    alert_id: { in: allAlertIds },
                    acknowledged_at: { not: null },
                    alert: { organization_id },
                },
                select: {
                    alert_id: true,
                    created_at: true,
                    acknowledged_at: true,
                },
            });

            // 4️⃣ Build alert_id -> response times (ms)
            const alertToDurations = new Map();
            for (const r of recipients) {
                const diffMs =
                    new Date(r.acknowledged_at).getTime() -
                    new Date(r.created_at).getTime();
                if (diffMs < 0 || Number.isNaN(diffMs)) continue;
                if (!alertToDurations.has(r.alert_id))
                    alertToDurations.set(r.alert_id, []);
                alertToDurations.get(r.alert_id).push(diffMs);
            }

            // 5️⃣ Compute average per site
            const data = sites.map((site) => {
                const alertIds = siteToAlertIds.get(site.id)
                    ? [...siteToAlertIds.get(site.id)]
                    : [];
                let totalMs = 0;
                let count = 0;

                for (const aid of alertIds) {
                    const times = alertToDurations.get(aid);
                    if (!times) continue;
                    for (const t of times) {
                        totalMs += t;
                        count++;
                    }
                }

                const avgMinutes =
                    count > 0 ? Number((totalMs / count / (1000 * 60)).toFixed(2)) : null;

                return {
                    site_name: site.name,
                    average_response_time: avgMinutes,
                };
            });

            return res.status(200).json({
                organization_id,
                unit: "minutes",
                data,
            });
        } catch (error) {
            console.error("getResponseTimeTrend error:", error);
            return res
                .status(500)
                .json({ message: "Server error", error: error.message });
        }
    },
    /**
   * GET /admin/general-settings
   * Returns:
   * company name,
   * industry type name,
   * primary contact name,
   * contact phone,
   * contact email,
   * time zone,
   * organization address object
   */
    getGeneralSettings: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id || req.query.organization_id;

            if (!organization_id) {
                return res.status(400).json({ success: false, message: "organization_id is required" });
            }

            const org = await prisma.organizations.findUnique({
                where: { organization_id },
                select: {
                    name: true,
                    time_zone: true,
                    main_contact_name: true,
                    main_contact_email: true,
                    main_contact_phone: true,
                    industry_type: { select: { name: true } },
                },
            });

            if (!org) {
                return res.status(404).json({ success: false, message: "Organization not found" });
            }

            // Pick a primary site as org address (oldest created)
            const primarySite = await prisma.sites.findFirst({
                where: { organization_id },
                orderBy: { created_at: "asc" },
                select: {
                    address_line_1: true,
                    address_line_2: true,
                    city: true,
                    state: true,
                    zip_code: true,
                },
            });

            const street = primarySite
                ? [primarySite.address_line_1, primarySite.address_line_2].filter(Boolean).join(", ")
                : "";

            return res.status(200).json({
                success: true,
                data: {
                    company_name: org.name,
                    industry_type_name: org.industry_type?.name ?? "",
                    primary_contact_name: org.main_contact_name ?? "",
                    contact_email: org.main_contact_email ?? "",
                    contact_phone: org.main_contact_phone ?? "",
                    time_zone: org.time_zone,
                    organization_address: {
                        street_address: street,
                        state: primarySite?.state ?? "",
                        city: primarySite?.city ?? "",
                        zip: primarySite?.zip_code ?? "",
                        country: "", // not in schema
                    },
                },
            });
        } catch (error) {
            console.error("getGeneralSettings error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    },


    /**
   * PUT /admin/general-settings
   * Body:
   * {
   *   company_name,
   *   industry_type_name,
   *   primary_contact_name,
   *   contact_phone,
   *   contact_email,
   *   time_zone,
   *   organization_address: { street_address, state, city, zip, country }
   * }
   */
    updateGeneralSettings: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id || req.body.organization_id;

            if (!organization_id) {
                return res.status(400).json({ success: false, message: "organization_id is required" });
            }

            const {
                company_name,
                time_zone,
                primary_contact_name,
                contact_email,
                contact_phone,
                industry_type_id,
                organization_address,
            } = req.body;

            // 1) Update Organizations table
            await prisma.organizations.update({
                where: { organization_id },
                data: {
                    ...(company_name !== undefined ? { name: company_name } : {}),
                    ...(time_zone !== undefined ? { time_zone } : {}),
                    ...(primary_contact_name !== undefined ? { main_contact_name: primary_contact_name } : {}),
                    ...(contact_email !== undefined ? { main_contact_email: contact_email } : {}),
                    ...(contact_phone !== undefined ? { main_contact_phone: contact_phone } : {}),
                    ...(industry_type_id !== undefined ? { industry_type_id } : {}),
                },
            });

            // 2) Update primary site's address (oldest created site)
            if (organization_address && typeof organization_address === "object") {
                const primarySite = await prisma.sites.findFirst({
                    where: { organization_id },
                    orderBy: { created_at: "asc" },
                    select: { id: true },
                });

                if (primarySite) {
                    await prisma.sites.update({
                        where: { id: primarySite.id },
                        data: {
                            ...(organization_address.street_address_line_1 !== undefined
                                ? { address_line_1: organization_address.street_address_line_1 }
                                : {}),
                            ...(organization_address.street_address_line_2 !== undefined
                                ? { address_line_2: organization_address.street_address_line_2 }
                                : {}),
                            ...(organization_address.city !== undefined ? { city: organization_address.city } : {}),
                            ...(organization_address.state !== undefined ? { state: organization_address.state } : {}),
                            ...(organization_address.zip !== undefined ? { zip_code: organization_address.zip } : {}),
                        },
                    });
                }
            }

            return res.status(200).json({
                success: true,
                message: "General settings updated successfully",
            });
        } catch (error) {
            console.error("updateGeneralSettings error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    },

    /**
     * GET /admin/billing-history
     * Source: subscriptions table
     *
     * Output (per row):
     * plan_name
     * amount
     * currency
     * billing_cycle
     * status
     * start_date
     * end_date
     * invoice_id
     * payment_method
     * created_at
     */
    getBillingHistory: async (req, res) => {
        try {
            const organization_id = req.user?.organization_id || req.query.organization_id;

            if (!organization_id) {
                return res.status(400).json({
                    success: false,
                    message: "organization_id is required",
                });
            }

            const rows = await prisma.subscriptions.findMany({
                where: { organization_id },
                orderBy: { created_at: "desc" },
                select: {
                    id: true,
                    status: true,
                    payment_status: true,
                    payment_method: true,
                    current_period_start: true,
                    current_period_end: true,
                    auto_renew: true,
                    created_at: true,

                    stripe_customer_id: true,
                    stripe_subscription_id: true,
                    stripe_price_id: true,

                    plan: {
                        select: {
                            id: true,
                            plan_name: true,
                            monthly_price: true,
                            annual_price: true,
                            stripe_price_id: true,
                        },
                    },
                },
            });

            // derive billing_cycle + amount from plan + period length
            const data = rows.map((s) => {
                const start = s.current_period_start ? new Date(s.current_period_start) : null;
                const end = s.current_period_end ? new Date(s.current_period_end) : null;

                let billing_cycle = "";
                if (start && end) {
                    const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
                    // rough heuristic
                    billing_cycle = days >= 330 ? "yearly" : "monthly";
                }

                const amount =
                    billing_cycle === "yearly"
                        ? (s.plan?.annual_price ?? null)
                        : (s.plan?.monthly_price ?? null);

                return {
                    subscription_id: s.id,
                    plan_id: s.plan?.id ?? null,
                    plan_name: s.plan?.plan_name ?? "",
                    billing_cycle,
                    amount, // Decimal (Prisma Decimal) – return as-is or stringify if needed
                    status: s.status,
                    payment_status: s.payment_status,
                    payment_method: s.payment_method ?? "",
                    period_start: s.current_period_start,
                    period_end: s.current_period_end,
                    auto_renew: s.auto_renew,
                    billed_at: s.created_at,
                    stripe: {
                        stripe_customer_id: s.stripe_customer_id,
                        stripe_subscription_id: s.stripe_subscription_id,
                        stripe_price_id: s.stripe_price_id,
                    },
                };
            });

            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error("getBillingHistory error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message,
            });
        }
    },


};


export default AdminController;
