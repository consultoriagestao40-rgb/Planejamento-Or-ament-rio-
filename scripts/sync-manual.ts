import { runCronSync } from '../src/lib/cronSync';
import { prisma } from '../src/lib/prisma';
import 'dotenv/config';

async function main() {
    console.log("Starting Sync for 2026...");
    try {
        const result = await runCronSync(2026);
        console.log("Sync Result Summary:");
        console.log(JSON.stringify({ 
            success: result.success, 
            year: result.year, 
            report: result.report 
        }, null, 2));
        
        console.log("\nSome Logs:");
        result.logs?.slice(0, 10).forEach(l => console.log(l));
        console.log("...");
        result.logs?.slice(-10).forEach(l => console.log(l));
        
    } catch (error) {
        console.error("Sync failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
