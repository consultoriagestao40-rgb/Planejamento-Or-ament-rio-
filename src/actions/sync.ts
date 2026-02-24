'use server'

import { syncData } from "@/lib/services";
import { runCronSync } from "@/app/api/cron/sync/route";

export async function syncFinancialData() {
    try {
        const data = await syncData();
        const year = new Date().getFullYear();
        await runCronSync(year);
        return { success: true, data };
    } catch (error) {
        console.error("Sync failed:", error);
        return { success: false, error: "Falha na sincronização. Verifique o console." };
    }
}
