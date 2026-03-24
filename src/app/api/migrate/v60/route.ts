import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log("🚀 Iniciando migração v60...");

        // Usar executeRawUnsafe para adicionar colunas se não existirem
        // PostgreSQL syntax
        await prisma.$executeRawUnsafe(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='RealizedEntry' AND column_name='customer') THEN
                    ALTER TABLE "RealizedEntry" ADD COLUMN "customer" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='RealizedEntry' AND column_name='date') THEN
                    ALTER TABLE "RealizedEntry" ADD COLUMN "date" TIMESTAMP WITH TIME ZONE;
                END IF;
            END $$;
        `);

        return NextResponse.json({ 
            success: true, 
            message: "Migração v60 concluída com sucesso (Colunas 'customer' e 'date' adicionadas)." 
        });

    } catch (error: any) {
        console.error("❌ Erro na migração v60:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
