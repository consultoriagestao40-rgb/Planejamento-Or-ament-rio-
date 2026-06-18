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

    } catch (error) {
        console.error("Sync failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
