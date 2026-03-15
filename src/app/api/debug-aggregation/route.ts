import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
        const spotTenants = allTenants.filter(t => t.name.toUpperCase().includes('SPOT'));

        const diagnostic: any = {
            spotTenantsCount: spotTenants.length,
            tenants: [],
            aggregationTest: {}
        };

        for (const t of spotTenants) {
            const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            
            const variants = allTenants.filter(ten => {
                const kn = (ten.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                const kc = (ten.cnpj || '').replace(/\D/g, '');
                const cnpjMatch = (cleanCnpj && kc) ? (cleanCnpj === kc) : true;
                return kn === cleanName && cnpjMatch;
            }).map(v => v.id);

            const entriesCompetencia = await prisma.realizedEntry.count({
                where: { tenantId: { in: variants }, year: 2026, viewMode: 'competencia' }
            });

            const entriesCaixa = await prisma.realizedEntry.count({
                where: { tenantId: { in: variants }, year: 2026, viewMode: 'caixa' }
            });

            const entriesAmount = await prisma.realizedEntry.aggregate({
                where: { tenantId: { in: variants }, year: 2026, viewMode: 'caixa' },
                _sum: { amount: true }
            });

            diagnostic.tenants.push({
                id: t.id,
                name: t.name,
                cnpj: t.cnpj,
                variants,
                entriesCompetencia,
                entriesCaixa,
                totalCaixaAmount: entriesAmount._sum.amount || 0
            });
        }

        return NextResponse.json(diagnostic);
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
