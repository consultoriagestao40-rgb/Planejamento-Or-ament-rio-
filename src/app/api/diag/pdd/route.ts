import { NextResponse } from 'next/server';
import { getValidAccessToken } from '../../../../lib/services';

const CLEAN_TECH_ID = '1fa165e3-178f-4d8f-ae7c-434c720c82dd';

export async function GET() {
    try {
        const { token } = await getValidAccessToken(CLEAN_TECH_ID);
        
        const results: any[] = [];
        
        // URLs para testar as Contas a Pagar (despesas) onde o PDD da Jasmine de R$ 2.700,00 pode estar cadastrado
        const testQueries = [
            {
                name: "Payables - Competência (Abril-Maio/2026)",
                url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=2026-04-01&data_competencia_ate=2026-05-31&tamanho_pagina=100`
            },
            {
                name: "Payables - Vencimento (Maio/2026)",
                url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-05-01&data_vencimento_ate=2026-05-31&tamanho_pagina=100`
            },
            {
                name: "Payables - Pagamento (Maio/2026)",
                url: `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_pagamento_de=2026-05-01&data_pagamento_ate=2026-05-31&tamanho_pagina=100`
            }
        ];
        
        for (const query of testQueries) {
            let pagina = 1;
            let hasMore = true;
            const queryMatches: any[] = [];
            
            while (hasMore && pagina <= 3) {
                const pagedUrl = `${query.url}&pagina=${pagina}`;
                const res = await fetch(pagedUrl, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    cache: 'no-store'
                });
                
                if (!res.ok) {
                    queryMatches.push({ error: `API Error ${res.status}: ${await res.text().catch(() => '')}` });
                    break;
                }
                
                const data = await res.json();
                const items = Array.isArray(data) ? data : (data.itens || []);
                if (items.length === 0) break;
                
                for (const item of items) {
                    const desc = item.descricao || item.description || '';
                    const amount = item.valor_total || item.total || item.valor || item.pago || 0;
                    const categories = item.categorias || (item.categoria ? [item.categoria] : []);
                    const clientName = item.cliente?.nome || item.fornecedor?.nome || item.creditor?.nome || '';
                    
                    const isMatch = amount === 2700 || amount === -2700 || 
                                    desc.toLowerCase().includes("jasmine") || 
                                    clientName.toLowerCase().includes("jasmine") || 
                                    categories.some((c: any) => {
                                        const cname = c.nome || c.name || '';
                                        return cname.includes("PDD") || cname.includes("Perda") || cname.includes("06.8");
                                    });
                                    
                    if (isMatch) {
                        queryMatches.push({
                            id: item.id,
                            descricao: desc,
                            valor: amount,
                            cliente: clientName,
                            status: item.status,
                            data_competencia: item.data_competencia,
                            data_vencimento: item.data_vencimento,
                            data_pagamento: item.data_pagamento,
                            data_baixa: item.data_baixa,
                            categorias: categories
                        });
                    }
                }
                
                if (items.length < 100) hasMore = false;
                else pagina++;
            }
            
            results.push({
                queryName: query.name,
                url: query.url,
                matchesFound: queryMatches.length,
                matches: queryMatches
            });
        }
        
        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
