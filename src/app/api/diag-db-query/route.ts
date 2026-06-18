import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const year = 2026;
        const month = 5;
        const viewMode = 'competencia';

        const targetCategory = await prisma.category.findUnique({
            where: { id: '7889b96b-3799-4962-964e-0c818ca50d51' }
        });
        const targetCategory2 = await prisma.category.findUnique({
            where: { id: '2cd8cdc9-ee2c-4630-bb4d-51cacf08ae9a' }
        });

        // 1. Busca os lançamentos realizados
        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                year,
                month,
                viewMode
            },
            include: {
                category: true,
                costCenter: true
            }
        });

        // 2. Agrupa por categoria e centro de custo
        const rawItems = realizedEntries.map(e => ({
            id: e.id,
            categoryId: e.categoryId,
            categoryName: e.category?.name || 'Sem Categoria',
            entradaDre: e.category?.entradaDre,
            costCenterId: e.costCenterId,
            costCenterName: e.costCenter?.name || 'NONE',
            amount: e.amount,
            externalId: e.externalId
        }));

        // 3. Agrega por DRE Group
        const dreGroups: Record<string, number> = {};
        rawItems.forEach(item => {
            const code = item.categoryName.match(/^([\d.]+)/)?.[1] || '';
            let group = 'OUTROS';
            
            if (code.startsWith('01') || code === '1') group = '01. RECEITA BRUTA';
            else if (code.startsWith('02') || code === '2') group = '02. TRIBUTO SOBRE FATURAMENTO';
            else if (code.startsWith('3') || code.startsWith('03')) group = '03. CUSTO OPERACIONAL';
            else if (code.startsWith('4') || code.startsWith('04')) group = '04. DESPESA OPERACIONAL';
            else if (code.startsWith('5') || code.startsWith('05')) group = '05. DESPESAS ADMINISTRATIVAS';
            else if (code.startsWith('6') || code.startsWith('06')) group = '06. DESPESAS FINANCEIRAS';
            
            dreGroups[group] = (dreGroups[group] || 0) + item.amount;
        });

        return NextResponse.json({
            success: true,
            totalEntries: realizedEntries.length,
            targetCategory,
            targetCategory2,
            dreGroups,
            rawItems
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
