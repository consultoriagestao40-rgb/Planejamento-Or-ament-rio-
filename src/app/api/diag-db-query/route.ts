import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const jvsTrat = tenants.find(t => t.name.toUpperCase().includes('TRATMENTOS') || t.name.toUpperCase().includes('TRATAMENTOS'));
        
        let sampleBudget = null;
        let sampleRealized = null;

        if (jvsTrat) {
            sampleBudget = await prisma.budgetEntry.findFirst({
                where: { tenantId: jvsTrat.id }
            });
            sampleRealized = await prisma.realizedEntry.findFirst({
                where: { tenantId: jvsTrat.id }
            });
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            sampleBudget,
            sampleRealized
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
