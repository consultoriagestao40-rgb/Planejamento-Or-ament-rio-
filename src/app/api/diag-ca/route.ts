import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const nameParam = searchParams.get('name') || 'JVS FACILITIES';
        
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: nameParam, mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ error: `Tenant ${nameParam} não encontrado.` });
        }

        // 1. Consultar banco de dados BudgetHub para este Tenant em 2026
        const dbEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenant.id,
                year: 2026
            },
            include: {
                category: true,
                costCenter: true
            }
        });

        const dbSummary = dbEntries.reduce((acc: any, curr) => {
            const mode = curr.viewMode;
            const month = curr.month;
            const key = `${mode}-m${month}`;
            if (!acc[key]) {
                acc[key] = { count: 0, amount: 0, categories: {} };
            }
            acc[key].count += 1;
            acc[key].amount += curr.amount;
            
            const catName = curr.category?.name || 'Sem Categoria';
            acc[key].categories[catName] = (acc[key].categories[catName] || 0) + curr.amount;
            return acc;
        }, {});

        // Filtrar lançamentos de Maio/2026 específicos para detalhamento
        const dbMayEntries = dbEntries.filter(e => e.month === 5).map(e => ({
            id: e.id,
            category: e.category?.name,
            cc: e.costCenter?.name || 'Sem CC',
            amount: e.amount,
            viewMode: e.viewMode,
            description: e.description,
            externalId: e.externalId
        }));

        let validToken = '';
        try {
            const authResult = await getValidAccessToken(tenant.id);
            validToken = authResult.token;
        } catch (authErr: any) {
            return NextResponse.json({
                sucesso: false,
                erro: "Erro de autenticação Conta Azul",
                detail: authErr.message,
                dbSummary
            });
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';

        // 2. Tentar chamadas na API do Conta Azul sem filtro de vencimento usando o token renovado
        // A: Contas a Receber por competencia de Maio/2026
        const recUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const recRes = await fetch(recUrl, {
            headers: { 'Authorization': `Bearer ${validToken}` },
            cache: 'no-store'
        });
        const recData = recRes.ok ? await recRes.json() : { error: true, status: recRes.status, body: await recRes.text() };

        // B: Contas a Pagar por competencia de Maio/2026
        const pagUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`;
        const pagRes = await fetch(pagUrl, {
            headers: { 'Authorization': `Bearer ${validToken}` },
            cache: 'no-store'
        });
        const pagData = pagRes.ok ? await pagRes.json() : { error: true, status: pagRes.status, body: await pagRes.text() };

        // C: Vendas com data de Maio/2026
        const salesUrl = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`;
        const salesRes = await fetch(salesUrl, {
            headers: { 'Authorization': `Bearer ${validToken}` },
            cache: 'no-store'
        });
        const salesData = salesRes.ok ? await salesRes.json() : { error: true, status: salesRes.status, body: await salesRes.text() };

        // D: Vendas do outro endpoint alternativo (/vendas)
        const salesAltUrl = `https://api-v2.contaazul.com/v1/vendas?data_emissao_de=${startStr}&data_emissao_ate=${endStr}&tamanho_pagina=100`;
        const salesAltRes = await fetch(salesAltUrl, {
            headers: { 'Authorization': `Bearer ${validToken}` },
            cache: 'no-store'
        });
        const salesAltData = salesAltRes.ok ? await salesAltRes.json() : { error: true, status: salesAltRes.status, body: await salesAltRes.text() };

        return NextResponse.json({
            sucesso: true,
            tenant: { id: tenant.id, name: tenant.name },
            dbSummary,
            dbMayEntriesCount: dbMayEntries.length,
            dbMayEntries,
            apiUrls: { recUrl, pagUrl, salesUrl, salesAltUrl },
            apiResponses: {
                contas_a_receber: recRes.ok ? { count: (recData.itens || []).length, total_sum: (recData.itens || []).reduce((acc: number, curr: any) => acc + (curr.total || 0), 0), sample: (recData.itens || []).slice(0, 5) } : recData,
                contas_a_pagar: pagRes.ok ? { count: (pagData.itens || []).length, total_sum: (pagData.itens || []).reduce((acc: number, curr: any) => acc + (curr.total || 0), 0), sample: (pagData.itens || []).slice(0, 5) } : pagData,
                vendas: salesRes.ok ? { count: (salesData.itens || salesData.vendas || []).length, total_sum: (salesData.itens || salesData.vendas || []).reduce((acc: number, curr: any) => acc + (curr.total || curr.valor_total || 0), 0), sample: (salesData.itens || salesData.vendas || []).slice(0, 5) } : salesData,
                vendas_alt: salesAltRes.ok ? { count: (salesAltData.itens || salesAltData.vendas || salesAltData || []).length, sample: (salesAltData.itens || salesAltData.vendas || salesAltData || []).slice(0, 3) } : salesAltData
            }
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message, stack: e.stack });
    }
}
