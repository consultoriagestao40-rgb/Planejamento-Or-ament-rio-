import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantGroups } from '@/lib/tenant-utils';

export async function GET() {
    try {
        const groups = await getTenantGroups();
        const results: any = {};
        
        for (const groupIds of groups) {
            const first = await prisma.tenant.findUnique({ where: { id: groupIds[0] }, select: { name: true } });
            const name = first?.name || groupIds[0];
            
            const comp = await prisma.realizedEntry.aggregate({
                where: { tenantId: { in: groupIds }, year: 2026, month: 1, viewMode: 'competencia' },
                _sum: { amount: true }
            });
            
            const caixa = await prisma.realizedEntry.aggregate({
                where: { tenantId: { in: groupIds }, year: 2026, month: 1, viewMode: 'caixa' },
                _sum: { amount: true }
            });
            
            results[name] = {
                competencia: comp._sum.amount || 0,
                caixa: caixa._sum.amount || 0
            };
        }
        
        return NextResponse.json({ ok: true, data: results });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
