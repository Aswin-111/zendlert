import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Seed Roles
    await prisma.roles.createMany({
        data: [
            { role_name: 'admin', description: 'Has full access to the system' },
            // { role_name: 'Manager', description: 'Manages teams and permissions' },
            { role_name: 'employee', description: 'A normal user under an organization' },
            { role_name: 'contractor', description: 'A contractor under an organization' },
            // { role_name: 'Staff', description: 'Performs operational tasks' },
            // { role_name: 'Viewer', description: 'Read-only access' },
            // { role_name: 'Support', description: 'Handles customer support' },
        ],
        skipDuplicates: true, // Avoid duplicates on rerun
    });

    const emergencyTypes = [
        {
            name: 'Fire',
            description: 'For incidents involving fire, smoke, or risk of explosion.'
        },
        {
            name: 'Medical Emergency',
            description: 'For any situation requiring immediate medical attention, such as injury or sudden illness.'
        },
        {
            name: 'Security Breach',
            description: 'For unauthorized access, suspicious activity, or direct threats to personnel or property.'
        },
        {
            name: 'Active Intruder',
            description: 'For situations involving an individual actively attempting to cause harm to people in a confined area.'
        },
        {
            name: 'HAZMAT Spill',
            description: 'For the accidental release or spill of hazardous materials that pose a threat to health or the environment.'
        },
        {
            name: 'Severe Weather',
            description: 'For alerts related to dangerous weather conditions like tornadoes, hurricanes, floods, or blizzards.'
        },
        {
            name: 'Earthquake',
            description: 'For incidents related to seismic activity affecting facility safety and structural integrity.'
        },
        {
            name: 'Power Outage',
            description: 'For unplanned loss of electrical power affecting operations and safety systems.'
        },
        {
            name: 'Evacuation',
            description: 'A general-purpose alert to initiate a full or partial evacuation of a site or area.'
        },
        {
            name: 'Gas Leak',
            description: 'For the suspected or confirmed leakage of natural gas or other dangerous gaseous substances.'
        }
    ];
    console.log(`🌱 Seeding emergency types...`);
    for (const type of emergencyTypes) {
        const post = await prisma.emergency_Types.upsert({
            where: { name: type.name },
            update: {},
            create: {
                organization_id: "1c6df909-6788-4866-9956-92a2ca3519f3",
                name: type.name,
                description: type.description,
                // These types are global, so organization_id is left as null
            },
        });
        console.log(`✅ Created/verified emergency type: ${post.name}`);
    }
    console.log(`Seeding finished. 🎉`);


    // emergency, weather, traffic, event, others
    // await prisma.emergency_Types.createMany({
    //     data: [
    //         { name: "emergency" },
    //         { name: "weather" },
    //         { name: "traffic" },
    //         { name: "event" },
    //     ],
    //     skipDuplicates: true, // Avoid duplicates on rerun
    // });
    // Seed Industry_Types
    await prisma.industry_Types.createMany({
        data: [
            { name: 'Information technology' },
            { name: 'Finance' },
            { name: 'Healthcare' },
            { name: 'Education' },
            { name: 'Manufacturing' },
            { name: 'Technology' },
        ],
        skipDuplicates: true,
    });
}

main()
    .then(() => {
        console.log('✅ Seeding complete');
        prisma.$disconnect();
    })
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        prisma.$disconnect();
        process.exit(1);
    });
