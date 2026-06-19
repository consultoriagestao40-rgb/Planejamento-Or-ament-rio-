import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const cleanTech = tenants.find(t => t.name.toUpperCase().includes('CLEAN TECH'));
        if (!cleanTech) {
            return NextResponse.json({ success: false, error: 'Clean Tech not found' });
        }

        const { token } = await getValidAccessToken(cleanTech.id);

        // Fetch contas a receber (receivables)
        const recUrl = "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=2026-05-01&data_competencia_ate=2026-05-31&tamanho_pagina=100";
        const recRes = await fetch(recUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        const recData = recRes.ok ? await recRes.json() : { error: true, details: await recRes.text() };

        // Fetch contas a pagar (payables)
        const pagUrl = "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=2026-05-01&data_competencia_ate=2026-05-31&tamanho_pagina=100";
        const pagRes = await fetch(pagUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        const pagData = pagRes.ok ? await pagRes.json() : { error: true, details: await pagRes.text() };

        return NextResponse.json({
            success: true,
            receivables: recData.itens || recData,
            payables: pagData.itens || pagData
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
