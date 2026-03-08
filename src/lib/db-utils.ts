import { prisma } from './prisma';

export async function ensureTenantSchema() {
    try {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION DEFAULT 0;
        `);
    } catch (err) {
        console.error("[SCHEMA] Error insuring Tenant schema:", err);
    }
}
