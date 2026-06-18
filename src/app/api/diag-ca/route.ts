import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const nameParam = searchParams.get('name') || 'JVS FACILITIES';
        
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: nameParam, mode: 'insensitive' } }
        });

        if (!tenant || !tenant.accessToken) {
            return NextResponse.json({ error: `Tenant ${nameParam} não possui Token válido salvo.` });
        }

        const startStr = '2026-05-01';
        const endStr = '2026-05-31';

        // 1. Fetch Contas a Receber
        const recRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`, {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
            cache: 'no-store'
        });
        if (!recRes.ok) {
            const err = await recRes.text();
            return NextResponse.json({ error: "Erro ao buscar contas a receber", status: recRes.status, detail: err });
        }
        const recData = await recRes.json();
        const recItems = recData ? (recData.itens || []) : [];

        // 2. Fetch Contas a Pagar
        const pagRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=${startStr}&data_competencia_ate=${endStr}&tamanho_pagina=100`, {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
            cache: 'no-store'
        });
        if (!pagRes.ok) {
            const err = await pagRes.text();
            return NextResponse.json({ error: "Erro ao buscar contas a pagar", status: pagRes.status, detail: err });
        }
        const pagData = await pagRes.json();
        const pagItems = pagData ? (pagData.itens || []) : [];

        // 3. Fetch Vendas
        const salesRes = await fetch(`https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`, {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
            cache: 'no-store'
        });
        if (!salesRes.ok) {
            const err = await salesRes.text();
            return NextResponse.json({ error: "Erro ao buscar vendas", status: salesRes.status, detail: err });
        }
        const salesData = await salesRes.json();
        const salesItems = salesData ? (salesData.itens || []) : [];

        // Audit lists
        const auditedReceivables = recItems.map((item: any) => {
            const cat = item.categorias?.[0] || {};
            const cc = item.centros_de_custo?.[0] || {};
            return {
                id: item.id,
                descricao: item.descricao,
                cliente: item.cliente?.nome,
                valor_total: item.total,
                valor_pago: item.pago,
                data_competencia: item.data_competencia,
                data_vencimento: item.data_vencimento,
                categoria: cat.nome,
                categoria_id: cat.id,
                cc: cc.nome,
                renegociacao: item.renegociacao,
                item_completo_para_inspecao: {
                    retencoes: item.retencoes,
                    valor_original: item.valor_original,
                    valor_liquido: item.valor_liquido
                }
            };
        });

        const auditedPayables = pagItems.map((item: any) => {
            const cat = item.categorias?.[0] || {};
            const cc = item.centros_de_custo?.[0] || {};
            return {
                id: item.id,
                descricao: item.descricao,
                fornecedor: item.fornecedor?.nome,
                valor_total: item.total,
                valor_pago: item.pago,
                data_competencia: item.data_competencia,
                categoria: cat.nome,
                cc: cc.nome
            };
        });

        // Filtrar contas a pagar de Salários e Férias para análise
        const auditedSalaries = auditedPayables.filter((p: any) => 
            p.categoria?.includes('Salário') || p.categoria?.includes('Férias') || p.categoria?.includes('03.1') || p.categoria?.includes('03.2')
        );

        return NextResponse.json({
            sucesso: true,
            tenant: { id: tenant.id, name: tenant.name },
            resumo: {
                total_contas_a_receber: recItems.length,
                total_contas_a_pagar: pagItems.length,
                total_vendas: salesItems.length
            },
            auditedReceivables: auditedReceivables.filter((r: any) => r.categoria?.includes('01.1') || r.categoria?.includes('Serviço')),
            auditedSalaries,
            salesBreakdown: salesItems.map((s: any) => ({
                id: s.id,
                numero: s.numero,
                data: s.data,
                total: s.total,
                cliente: s.cliente?.nome,
                situacao: s.situacao?.nome
            }))
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
