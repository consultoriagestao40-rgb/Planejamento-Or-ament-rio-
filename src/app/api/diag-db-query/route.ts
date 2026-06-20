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
        
        let categories = [];
        if (jvsTrat) {
            categories = await prisma.category.findMany({
                where: { tenantId: jvsTrat.id },
                select: { id: true, name: true, type: true }
            });
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            categories
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
