import { runCronSync } from '../src/lib/cronSync';
import { prisma } from '../src/lib/prisma';
import 'dotenv/config';

async function main() {
    console.log("Starting Targeted Sync for May 2026...");
    try {
        // Sync JVS Facilities
        console.log("\n--- Syncing JVS Facilities (May 2026) ---");
        const jvsResult = await runCronSync(2026, 'dc2b6eed-a38a-43c3-9465-ce854bfda90f', 5, 5);
        console.log("JVS Sync Result:", JSON.stringify(jvsResult.report, null, 2));

        // Sync Spot Facilities
        console.log("\n--- Syncing Spot Facilities (May 2026) ---");
        const spotResult = await runCronSync(2026, '413f88a7-ce4a-4620-b044-43ef909b7b26', 5, 5);
        console.log("Spot Sync Result:", JSON.stringify(spotResult.report, null, 2));

        // Sync Clean Tech
        console.log("\n--- Syncing Clean Tech (May 2026) ---");
        const cleanTechResult = await runCronSync(2026, '1fa165e3-178f-4d8f-ae7c-434c720c82dd', 5, 5);
        console.log("Clean Tech Sync Result:", JSON.stringify(cleanTechResult.report, null, 2));

    } catch (error) {
        console.error("Sync failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
