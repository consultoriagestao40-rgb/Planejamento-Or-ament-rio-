import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const results = [];
        
        for (const t of tenants) {
            const categoriesCount = await prisma.category.count({
                where: { tenantId: t.id }
            });
            const realizedCount = await prisma.realizedEntry.count({
                where: { tenantId: t.id, year: 2026, month: 5, viewMode: 'competencia' }
            });
            
            results.push({
                tenantId: t.id,
                tenantName: t.name,
                categoriesCount,
                realizedCount
            });
        }
        
        return NextResponse.json({
            success: true,
            results
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
