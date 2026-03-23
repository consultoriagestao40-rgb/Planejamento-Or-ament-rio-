import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');
        
        // Simple security check
        if (key !== 'dre_migration_v58') {
             return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log("Starting Migration v58: RealizedJustification table");

        // Try to create the table using raw SQL
        await (prisma as any).$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "RealizedJustification" (
                "id" TEXT NOT NULL,
                "tenantId" TEXT NOT NULL,
                "categoryId" TEXT NOT NULL,
                "costCenterId" TEXT NOT NULL DEFAULT 'DEFAULT',
                "month" INTEGER NOT NULL,
                "year" INTEGER NOT NULL,
                "viewMode" TEXT NOT NULL DEFAULT 'competencia',
                "content" TEXT NOT NULL,
                "userName" TEXT NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "RealizedJustification_pkey" PRIMARY KEY ("id")
            );
        `);
        
        console.log("Table created or already exists");

        // Create Indices
        try {
            await (prisma as any).$executeRawUnsafe(`CREATE INDEX "RealizedJustification_tenantId_idx" ON "RealizedJustification"("tenantId");`);
        } catch (e) {
            console.log("Index tenantId might already exist");
        }

        try {
            await (prisma as any).$executeRawUnsafe(`CREATE INDEX "RealizedJustification_categoryId_idx" ON "RealizedJustification"("categoryId");`);
        } catch (e) {
            console.log("Index categoryId might already exist");
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Migração concluída: Tabela RealizedJustification pronta.' 
        });
    } catch (error: any) {
        console.error("Migration Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
