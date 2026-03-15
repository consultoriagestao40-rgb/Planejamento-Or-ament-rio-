import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ 
            where: { name: { contains: 'SPOT', mode: 'insensitive' } } 
        });

        if (!spot) return NextResponse.json({ error: "SPOT not found" });

        const { token } = await getValidAccessToken(spot.id);
        
        // TEST CONTA AZUL SEARCH PARAMETERS
        const start = `2025-11-01`;
        const end = `2026-12-31`;
        
        // Try VENCIMENTO first
        const urlVenc = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${start}&data_vencimento_ate=${end}&tamanho_pagina=100`;
        const resVenc = await fetch(urlVenc, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const dataVenc = await resVenc.json();

        // Try PAGAMENTO
        const urlPag = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_pagamento_de=${start}&data_pagamento_ate=${end}&tamanho_pagina=100`;
        const resPag = await fetch(urlPag, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const dataPag = await resPag.json();

        const dbEntries = await prisma.realizedEntry.findMany({
            where: { tenantId: spot.id, year: 2026 },
            take: 10
        });

        return NextResponse.json({ 
            success: true, 
            version: "0.3.6-TEST-PARAMS",
            vencimentoResult: {
                count: (dataVenc.itens || []).length,
                total: (dataVenc.itens || []).reduce((s:any, i:any) => s + (i.amount || 0), 0)
            },
            pagamentoResult: {
                count: (dataPag.itens || []).length,
                total: (dataPag.itens || []).reduce((s:any, i:any) => s + (i.amount || 0), 0)
            },
            dbEntriesCount: dbEntries.length
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
