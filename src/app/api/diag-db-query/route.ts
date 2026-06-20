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
        
        let revenueCategories = [];
        if (jvsTrat) {
            const categories = await prisma.category.findMany({
                where: { tenantId: jvsTrat.id }
            });
            revenueCategories = categories.filter(c => {
                const cleanCode = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
                const isCodeRev = cleanCode.startsWith('01') || cleanCode === '1';
                return isCodeRev || c.type === 'RECEITA' || c.type === 'REVENUE';
            });
        }

        return NextResponse.json({
            success: true,
            jvsTrat,
            revenueCategories
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
