import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');
        
        if (key !== 'dre_migration_v58') {
             return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log("Starting Migration v58.7: Fixing RealizedJustification table");

        // 1. Create table if not exists (with exact schema)
        await (prisma as any).$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "RealizedJustification" (
                "id" TEXT NOT NULL,
                "tenantId" TEXT NOT NULL,
                "categoryId" TEXT NOT NULL,
                "costCenterId" TEXT,
                "month" INTEGER NOT NULL,
                "year" INTEGER NOT NULL,
                "viewMode" TEXT NOT NULL DEFAULT 'competencia',
                "content" TEXT NOT NULL,
                "userName" TEXT NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "RealizedJustification_pkey" PRIMARY KEY ("id")
            );
        `);

        // 2. Fix missing columns if table already existed partially
        try {
            await (prisma as any).$executeRawUnsafe(`ALTER TABLE "RealizedJustification" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
        } catch (e) { console.log("updatedAt might already exist"); }

        try {
            await (prisma as any).$executeRawUnsafe(`ALTER TABLE "RealizedJustification" ALTER COLUMN "costCenterId" DROP NOT NULL;`);
        } catch (e) { console.log("costCenterId adjustment error or already nullable"); }

        // 3. Ensure indices
        try {
            await (prisma as any).$executeRawUnsafe(`CREATE INDEX "RealizedJustification_tenantId_categoryId_month_year_idx" ON "RealizedJustification"("tenantId", "categoryId", "month", "year");`);
        } catch (e) { console.log("Index might already exist"); }

        return NextResponse.json({ 
            success: true, 
            message: 'Migração concluída: Tabela RealizedJustification fixada com updatedAt.' 
        });
    } catch (error: any) {
        console.error("Migration Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
