'use server'

import { runCronSync } from "@/lib/cronSync";

export async function syncFinancialData() {
    try {
        const data = await runCronSync(new Date().getFullYear());
        return { success: true, data };
    } catch (error) {
        console.error("Sync failed:", error);
        return { success: false, error: "Falha na sincronização. Verifique o console." };
    }
}
