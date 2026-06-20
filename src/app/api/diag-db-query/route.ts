import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const jvsTrat = tenants.find(t => t.name.toUpperCase().includes('TRATAMENTOS') || t.name.toUpperCase().includes('TRATMENTOS'));
        if (!jvsTrat) {
            return NextResponse.json({ success: true, error: 'JVS TRATMENTOS tenant not found', tenants });
        }

        const categories = await prisma.category.findMany({
            where: { tenantId: jvsTrat.id }
        });

        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: jvsTrat.id,
                year: 2026
            },
            include: {
                category: true,
                costCenter: true
            }
        });

        return NextResponse.json({
            success: true,
            tenant: jvsTrat,
            categoriesCount: categories.length,
            categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type, code: c.id.split(':').pop() })),
            realizedEntriesCount: realizedEntries.length,
            realizedEntries: realizedEntries.map(e => ({
                id: e.id,
                month: e.month,
                amount: e.amount,
                description: e.description,
                customer: e.customer,
                viewMode: e.viewMode,
                externalId: e.externalId,
                categoryName: e.category?.name,
                costCenterName: e.costCenter?.name
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
