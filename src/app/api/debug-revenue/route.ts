import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, cnpj: true } });
        
        const jan = await prisma.realizedEntry.findMany({
            where: { year: 2026, month: 0, viewMode: 'competencia' }
        });
        
        // Get categories separately
        const categories = await prisma.category.findMany({ select: { id: true, name: true } });
        const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
        const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
        
        const byTenant: Record<string, number> = {};
        for (const e of jan) {
            const key = `${tenantMap[e.tenantId] || 'UNKNOWN'} [${e.tenantId.slice(0, 8)}]`;
            if (!byTenant[key]) byTenant[key] = 0;
            byTenant[key] += e.amount;
        }
        
        return NextResponse.json({ tenants, jan_total_by_tenant: byTenant, total_entries: jan.length });
    } catch(e: any) {
        return NextResponse.json({ error: e.message });
    }
}

