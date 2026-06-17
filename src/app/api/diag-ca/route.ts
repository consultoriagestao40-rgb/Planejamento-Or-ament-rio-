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

        const year = 2026;
        const month = 5;
        const viewMode = 'competencia';
        const paddedMonth = month.toString().padStart(2, '0');
        const startStr = `${year}-${paddedMonth}-01`;
        const endStr = `${year}-${paddedMonth}-31`;
        const dateParam = 'data_competencia';

        const urls = [
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`
        ];

        const steps: any[] = [];
        const monthValues: Record<string, number> = {};

        for (const url of urls) {
            let pagina = 1;
            let hasMore = true;
            
            while (hasMore) {
                const pagedUrl = `${url}&pagina=${pagina}`;
                const res = await fetch(pagedUrl, { 
                    headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
                    cache: 'no-store'
                });
                
                if (!res.ok) {
                    steps.push({
                        url: pagedUrl,
                        status: res.status,
                        error: await res.text()
                    });
                    break;
                }
                
                const data = await res.json();
                const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
                
                steps.push({
                    url: pagedUrl,
                    status: res.status,
                    itemsCount: items.length
                });

                if (items.length === 0) break;

                for (const item of items) {
                    const amount = item.valor_total || item.total || item.valor || item.pago || 0;
                    // Adicionamos item.data para suportar vendas do Conta Azul v2
                    const dateStr = item.data_competencia || item.data_emissao || item.venda_em || item.data_pagamento || item.data;
                    
                    if (!dateStr) {
                        steps.push({
                            skip: 'Sem data',
                            item: { id: item.id, descricao: item.descricao }
                        });
                        continue;
                    }
                    
                    const dateObj = new Date(dateStr);
                    if (dateObj.getFullYear() !== year) {
                        steps.push({
                            skip: 'Ano diferente',
                            item: { id: item.id, dateStr, year: dateObj.getFullYear() }
                        });
                        continue;
                    }

                    const monthIdx = dateObj.getMonth();
                    const ccs = item.centros_de_custo || [];
                    const categories = item.categorias || (item.categoria ? [item.categoria] : []);
                    
                    if (categories.length === 0) {
                        steps.push({
                            skip: 'Sem categorias',
                            item: { id: item.id, descricao: item.descricao }
                        });
                        continue;
                    }

                    const catToUse = categories[0];
                    const catId = catToUse.id || catToUse.categoria_id;
                    const catValue = amount;

                    if (ccs.length === 0) {
                        const key = `${catId}|NONE-${monthIdx}`;
                        monthValues[key] = (monthValues[key] || 0) + catValue;
                        steps.push({
                            added: 'Sem CC',
                            key,
                            value: catValue,
                            item: { id: item.id, descricao: item.descricao }
                        });
                    } else {
                        ccs.forEach((c: any) => {
                            const ccId = c.id;
                            const percent = (c.percentual || (100 / ccs.length)) / 100;
                            const key = `${catId}|${ccId}-${monthIdx}`;
                            monthValues[key] = (monthValues[key] || 0) + (catValue * percent);
                            steps.push({
                                added: 'Com CC',
                                key,
                                value: catValue * percent,
                                item: { id: item.id, ccName: c.nome }
                            });
                        });
                    }
                }
                
                if (items.length < 100) hasMore = false;
                pagina++;
            }
        }

        const entriesToSave: any[] = [];
        const filterSteps: any[] = [];

        for (const [key, amount] of Object.entries(monthValues)) {
            const [idsPart, monthIdxStr] = key.split('-');
            const [catId, ccId] = idsPart.split('|');
            const monthIdx = parseInt(monthIdxStr, 10);
            
            const matchesMonth = monthIdx + 1 === month;
            filterSteps.push({
                key,
                amount,
                monthIdx,
                expectedMonth: month,
                matchesMonth
            });

            if (!matchesMonth) continue;

            entriesToSave.push({
                tenantId: tenant.id,
                categoryId: catId,
                costCenterId: (ccId === 'NONE' || !ccId) ? null : ccId,
                month: monthIdx + 1,
                year,
                amount: Math.abs(amount),
                viewMode,
                externalId: `sync-${tenant.id}-${catId}-${ccId || 'NONE'}-${year}-${monthIdx}-${viewMode}`,
                description: `Sincronização ${viewMode}`
            });
        }

        return NextResponse.json({
            sucesso: true,
            tenant: { id: tenant.id, name: tenant.name },
            monthValues,
            filterSteps,
            entriesToSave,
            steps: steps.slice(0, 100) // limitados para evitar resposta muito gigante
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
