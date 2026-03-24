import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log("🚀 Iniciando criação da categoria 'Retenção na fonte'...");

        // 1. Buscar todas as categorias pai "02.1 - Tributos" ou similares
        const parents = await prisma.category.findMany({
            where: {
                OR: [
                    { name: { contains: '02.1' } },
                    { name: { contains: 'Tributos' } }
                ],
                parentId: { not: null } // Garante que pegamos o nível 2.1 e não o 2.0 (Total)
            }
        });

        if (parents.length === 0) {
            return NextResponse.json({ success: false, error: "Categoria pai '02.1 - Tributos' não encontrada." });
        }

        const created = [];

        for (const parent of parents) {
            const newId = `${parent.tenantId}:02.01.03`;
            const newName = "02.1.3 - Retenção na fonte";
            
            // Tenta criar ou atualizar
            const cat = await prisma.category.upsert({
                where: { id: newId },
                update: {
                    name: newName,
                    parentId: parent.id,
                    entradaDre: parent.entradaDre,
                    type: "EXPENSE"
                },
                create: {
                    id: newId,
                    name: newName,
                    parentId: parent.id,
                    tenantId: parent.tenantId,
                    type: "EXPENSE",
                    entradaDre: parent.entradaDre
                }
            });
            created.push(cat.id);
        }

        return NextResponse.json({ 
            success: true, 
            message: `Categoria criada/atualizada para ${created.length} empresas.`,
            ids: created
        });

    } catch (error: any) {
        console.error("❌ Erro ao criar categoria:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
