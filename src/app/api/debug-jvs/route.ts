import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { name: { contains: 'JVS', mode: 'insensitive' } }
        });

        const data = [];
        for (const t of tenants) {
            const sum = await prisma.realizedEntry.aggregate({
                where: { 
                    tenantId: t.id, 
                    year: 2026, 
                    month: 0, 
                    category: { code: { startsWith: '01' } } 
                },
                _sum: { amount: true }
            });

            data.push({
                tenant: { id: t.id, name: t.name, cnpj: t.cnpj, updatedAt: t.updatedAt },
                jan2026Revenue: sum._sum.amount || 0,
                normalizedKey: (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
            });
        }

        return NextResponse.json({
            success: true,
            jvs_diag: data,
            total_grid_perspective: data.reduce((acc, curr) => acc + curr.jan2026Revenue, 0)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
