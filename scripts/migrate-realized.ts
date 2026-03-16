import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
    console.log('[MIGRATION] Starting RealizedEntry evolution...');
    try {
        // 1. Add columns
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "RealizedEntry" ADD COLUMN IF NOT EXISTS "description" TEXT;
            ALTER TABLE "RealizedEntry" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
        `);
        console.log('[MIGRATION] Columns added.');

        // 2. Drop old constraint (if exists)
        // We'll try to catch error if it doesn't exist
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "RealizedEntry" DROP CONSTRAINT IF EXISTS "RealizedEntry_tenantId_categoryId_costCenterId_month_year_viewMode_key";
            `);
            console.log('[MIGRATION] Old unique constraint dropped.');
        } catch(e) { console.log('[MIGRATION] Constraint drop skipped or failed (might not exist)'); }

        // 3. Optional: Add new index for performance
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "RealizedEntry_tenantId_idx" ON "RealizedEntry"("tenantId");
            CREATE INDEX IF NOT EXISTS "RealizedEntry_categoryId_idx" ON "RealizedEntry"("categoryId");
        `);
        console.log('[MIGRATION] Indexes created.');

    } catch (err) {
        console.error('[MIGRATION] Error:', err);
    }
}

migrate().catch(console.error).finally(() => prisma.$disconnect());
