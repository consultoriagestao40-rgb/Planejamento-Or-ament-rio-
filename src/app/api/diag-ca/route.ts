import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function fetchAllPages(urlBase: string, token: string) {
    let pagina = 1;
    let hasMore = true;
    const items: any[] = [];
    
    while (hasMore) {
        const sep = urlBase.includes('?') ? '&' : '?';
        const url = `${urlBase}${sep}pagina=${pagina}&tamanho_pagina=100`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        
        if (!res.ok) {
            throw new Error(`Erro API ${url}: ${res.status} ${await res.text()}`);
        }
        
        const data = await res.json();
        const pageItems = data.itens || data.vendas || data || [];
        if (pageItems.length === 0) break;
        items.push(...pageItems);
        if (pageItems.length < 100) hasMore = false;
        pagina++;
    }
    return items;
}

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

        // 1. Refresh do Token
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return NextResponse.json({ error: "Credenciais Conta Azul ausentes." });
        }

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenRes = await fetch('https://auth.contaazul.com/oauth2/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tenant.refreshToken || '' }),
            cache: 'no-store'
        });

        let activeToken = tenant.accessToken || '';
        if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            activeToken = tokenData.access_token;
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
                }
            });
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';
        const year = 2026;

        // 2. Buscar TODOS os registros da API usando paginação
        const recs = await fetchAllPages(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}`, activeToken);
        const pags = await fetchAllPages(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}`, activeToken);
        const sales = await fetchAllPages(`https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}`, activeToken);

        // 3. Buscar os lançamentos salvos no banco para Maio/2026
        const dbEntries = await prisma.realizedEntry.findMany({
            where: { tenantId: tenant.id, year: 2026, month: 5 },
            include: { category: true, costCenter: true }
        });

        // Detalhar salários do banco vs API
        const dbSalaries = dbEntries.filter(e => e.categoryId === 'eda8d2a9-a0ba-44c7-ab3f-ceceb030bf75' || e.category?.name?.includes('Salário') || e.category?.name?.includes('03.1.1'));
        
        const apiSalaries = pags.filter((p: any) => 
            p.categorias?.some((c: any) => c.nome?.includes('Salário') || c.nome?.includes('03.1.1'))
        ).map((p: any) => ({
            id: p.id,
            descricao: p.descricao,
            total: p.total,
            competencia: p.data_competencia,
            categoria: p.categorias?.[0]?.nome,
            categorias_todas: p.categorias?.map((c: any) => c.nome)
        }));

        // Detalhar faturamento da API vs banco
        const apiReceivablesFaturamento = recs.filter((r: any) => 
            r.categorias?.some((c: any) => c.nome?.includes('Serviço') || c.nome?.includes('01.1.1') || c.nome?.includes('01.1.2'))
        ).map((r: any) => ({
            id: r.id,
            descricao: r.descricao,
            total: r.total,
            competencia: r.data_competencia,
            categoria: r.categorias?.[0]?.nome,
            categorias_todas: r.categorias?.map((c: any) => c.nome)
        }));

        return NextResponse.json({
            sucesso: true,
            counts: {
                api_contas_a_receber: recs.length,
                api_contas_a_pagar: pags.length,
                api_vendas: sales.length,
                db_entries_maio: dbEntries.length
            },
            salarios: {
                db_sum: dbSalaries.reduce((acc, curr) => acc + curr.amount, 0),
                api_sum: apiSalaries.reduce((acc, curr) => acc + curr.total, 0),
                db_count: dbSalaries.length,
                api_count: apiSalaries.length,
                db_items: dbSalaries.map(e => ({ id: e.id, cat: e.category?.name, cc: e.costCenter?.name || 'Sem CC', amount: e.amount, desc: e.description })),
                api_items: apiSalaries
            },
            faturamento: {
                api_receivables_sum: apiReceivablesFaturamento.reduce((acc, curr) => acc + curr.total, 0),
                api_sales_sum: sales.reduce((acc, curr) => acc + (curr.total || 0), 0),
                api_receivables_count: apiReceivablesFaturamento.length,
                api_sales_count: sales.length,
                api_receivables: apiReceivablesFaturamento
            }
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message, stack: e.stack });
    }
}
