import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log("🛠️ Tentando remover restrições de unicidade conflitantes...");

        // Tentar encontrar o nome da constraint que falhou no screenshot
        // ("tenantId", "categoryId", "costCenterId", "month", "year", "viewMode")
        
        const constraints = await prisma.$queryRawUnsafe(`
            SELECT conname 
            FROM pg_constraint c 
            JOIN pg_namespace n ON n.oid = c.connamespace 
            WHERE conrelid = '"RealizedEntry"'::regclass 
            AND pg_get_constraintdef(c.oid) LIKE '%tenantId%'
            AND pg_get_constraintdef(c.oid) LIKE '%categoryId%'
            AND pg_get_constraintdef(c.oid) LIKE '%viewMode%';
        `) as any[];

        for (const c of constraints) {
            console.log(`🗑️ Removendo constraint: ${c.conname}`);
            await prisma.$executeRawUnsafe(`ALTER TABLE "RealizedEntry" DROP CONSTRAINT "${c.conname}"`);
        }

        return NextResponse.json({ 
            success: true, 
            removed: constraints.map(c => c.conname),
            message: "Restrições removidas. Tente a importação novamente."
        });

    } catch (error: any) {
        console.error("❌ Erro ao remover constraints:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
