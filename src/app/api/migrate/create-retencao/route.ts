import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log("🚀 Refinando a categoria 'Retenção na fonte'...");

        // 1. Buscar a categoria que é o GRUPO de tributos
        // Geralmente tem ID terminando em :02.01 ou nome "Tributos" no nível 2
        const allCategories = await prisma.category.findMany();
        
        const tenants = await prisma.tenant.findMany({ select: { id: true } });
        const results = [];

        for (const tenant of tenants) {
            // Achar o melhor pai para este tenant
            const parent = allCategories.find(c => 
                c.tenantId === tenant.id && 
                ((c.name.includes('02.1') && !c.name.includes('02.1.')) || 
                 (c.name.toLowerCase() === 'tributos') ||
                 (c.id.endsWith(':02.01')))
            );

            if (parent) {
                const newId = `${tenant.id}:02.01.03`;
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
                        tenantId: tenant.id,
                        type: "EXPENSE",
                        entradaDre: parent.entradaDre || "TRIBUTOS"
                    }
                });
                results.push({ tenantId: tenant.id, parentName: parent.name, newCat: cat.name });
            }
        }

        // 2. Limpar categorias órfãs ou erradas criadas anteriormente (se necessário)
        // O upsert no ID fixo já sobrescreve a maioria, mas se mudamos o ID, pode haver lixo.

        return NextResponse.json({ 
            success: true, 
            message: `Processado para ${results.length} empresas.`,
            results
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
