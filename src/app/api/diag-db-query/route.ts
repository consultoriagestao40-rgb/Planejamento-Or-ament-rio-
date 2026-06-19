import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Clean Tech Tenant not found' });
        }

        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenant.id,
                month: 5,
                year: 2026,
                viewMode: 'competencia'
            },
            include: {
                category: true
            }
        });

        // Agrupar por entrada DRE / Categoria
        const groups: Record<string, number> = {};
        let totalRevenue = 0;
        let totalTaxes = 0;
        let totalCosts = 0;
        let totalOpExp = 0;
        let totalAdminExp = 0;
        let totalFin = 0;

        for (const entry of entries) {
            const catName = entry.category.name;
            const code = catName.split(' ')[0] || '';
            const amount = entry.amount;

            groups[catName] = (groups[catName] || 0) + amount;

            if (code.startsWith('01') || code.startsWith('1')) {
                totalRevenue += amount;
            } else if (code.startsWith('02') || code.startsWith('2.1')) {
                totalTaxes += amount;
            } else if (code.startsWith('03') || code.startsWith('3')) {
                totalCosts += amount;
            } else if (code.startsWith('04') || code.startsWith('4')) {
                totalOpExp += amount;
            } else if (code.startsWith('05') || code.startsWith('5')) {
                totalAdminExp += amount;
            } else if (code.startsWith('06') || code.startsWith('6')) {
                totalFin += amount;
            }
        }

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            summary: {
                totalRevenue,
                totalTaxes,
                netRevenue: totalRevenue - totalTaxes,
                totalCosts,
                grossMargin: totalRevenue - totalTaxes - totalCosts,
                totalOpExp,
                contributionMargin: totalRevenue - totalTaxes - totalCosts - totalOpExp,
                totalAdminExp,
                ebitda: totalRevenue - totalTaxes - totalCosts - totalOpExp - totalAdminExp,
                totalFin,
                netProfit: totalRevenue - totalTaxes - totalCosts - totalOpExp - totalAdminExp - totalFin
            },
            groups,
            entriesCount: entries.length
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
