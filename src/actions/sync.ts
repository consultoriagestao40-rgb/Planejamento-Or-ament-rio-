'use server'

import { syncData } from "@/lib/services";

export async function syncFinancialData() {
    try {
        const data = await syncData();
        return { success: true, data };
    } catch (error) {
        console.error("Sync failed:", error);
        return { success: false, error: "Falha na sincronização. Verifique o console." };
    }
}
