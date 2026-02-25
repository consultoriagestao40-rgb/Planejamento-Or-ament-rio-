import { runCronSync } from '../src/app/api/cron/sync/route';

async function test() {
    console.log("Starting runCronSync...");
    try {
        const result = await runCronSync(2026);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("Cron failed:", e);
    }
}
test();
