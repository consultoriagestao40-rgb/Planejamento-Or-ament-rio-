import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats = await prisma.$queryRaw`
            SELECT "tenantId", count(*), sum(amount) as total 
            FROM "RealizedEntry" 
            WHERE year = 2026 
            GROUP BY "tenantId"
        `;

        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true }
        });

        const firstTenant = tenants.find(t => t.name.includes('SPOT')) || tenants[0];
        let ca_sample = null;
        if (firstTenant) {
            const { getValidAccessToken } = await import('@/lib/services');
            const { token } = await getValidAccessToken(firstTenant.id);
            const startStr = '2026-01-01';
            const endStr = '2026-01-31';
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=5`;
            const caRes = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (caRes.ok) ca_sample = await caRes.json();
            else ca_sample = { error: caRes.status, url };
        }

        return NextResponse.json({
            success: true,
            db_distribution: stats,
            active_tenants: tenants,
            ca_sample
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
