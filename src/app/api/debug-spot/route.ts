import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spotTenants = await prisma.tenant.findMany({
            where: { name: { contains: 'SPOT', mode: 'insensitive' } }
        });
        
        const results = [];
        for (const t of spotTenants) {
            const entries = await prisma.realizedEntry.findMany({
                where: {
                    tenantId: t.id,
                    year: 2026,
                    month: 0,
                    category: { name: { startsWith: '01' } }
                },
                include: { category: true, costCenter: true }
            });
            
            results.push({
                tenant: t.name,
                id: t.id,
                count: entries.length,
                total: entries.reduce((acc, curr) => acc + curr.amount, 0),
                entries: entries.map(e => ({
                    amount: e.amount,
                    category: e.category.name,
                    cc: e.costCenter?.name || 'NONE',
                    id: e.id,
                    updatedAt: e.updatedAt
                }))
            });
        }
        
        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
