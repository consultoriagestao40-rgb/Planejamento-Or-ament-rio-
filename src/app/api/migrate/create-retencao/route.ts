import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log("🚀 Iniciando criação da categoria 'Retenção na fonte' (Versão Robusta)...");

        // 1. Buscar todas as categorias que pareçam ser "Tributos" no nível 2
        // Elas geralmente começam com 02.01 ou 2.1
        const parents = await prisma.category.findMany({
            where: {
                OR: [
                    { name: { contains: '02.1' } },
                    { name: { contains: '2.1' } },
                    { name: { contains: 'Tributos' } },
                    { name: { contains: 'Impostos' } },
                    { id: { contains: ':02.01' } }
                ],
                // Evitar pegar a própria subcategoria se ela já existir
                NOT: { name: { contains: 'Retenção' } }
            }
        });

        if (parents.length === 0) {
            // Se não achou por nome, tenta listar as de nível 1 para ver os IDs
            const allLevel1 = await prisma.category.findMany({
                where: { parentId: null },
                take: 10
            });
            return NextResponse.json({ 
                success: false, 
                error: "Categoria pai não encontrada com filtros padrão.",
                debug_level1: allLevel1.map(c => ({ id: c.id, name: c.name }))
            });
        }

        const created = [];

        for (const parent of parents) {
            // Garantir que estamos pegando o nó correto (Geralmente 02.1 - Tributos)
            // Se o parent tiver um "parentId" que aponta para "02 - Despesas", ele é o alvo certo.
            
            const newId = `${parent.tenantId}:02.01.03`;
            const newName = "02.1.3 - Retenção na fonte";
            
            const cat = await prisma.category.upsert({
                where: { id: newId },
                update: {
                    name: newName,
                    parentId: parent.id,
                    entradaDre: parent.entradaDre || "TRIBUTOS",
                    type: "EXPENSE"
                },
                create: {
                    id: newId,
                    name: newName,
                    parentId: parent.id,
                    tenantId: parent.tenantId,
                    type: "EXPENSE",
                    entradaDre: parent.entradaDre || "TRIBUTOS"
                }
            });
            created.push({ id: cat.id, name: cat.name, parentName: parent.name });
        }

        return NextResponse.json({ 
            success: true, 
            message: `Categoria criada/atualizada para ${created.length} empresas.`,
            details: created
        });

    } catch (error: any) {
        console.error("❌ Erro ao criar categoria:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
