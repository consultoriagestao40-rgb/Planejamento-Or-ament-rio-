import { NextResponse } from 'next/server';
import { getValidAccessToken } from '../../../../lib/services';

const CLEAN_TECH_ID = '1fa165e3-178f-4d8f-ae7c-434c720c82dd';

export async function GET() {
    try {
        const { token } = await getValidAccessToken(CLEAN_TECH_ID);
        
        const results: any[] = [];
        let pagina = 1;
        let hasMore = true;
        
        // Busca ampla por todas as contas a receber com vencimento em 2026
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100`;
        
        while (hasMore && pagina <= 5) { // Escanear até 500 registros para abranger o ano
            const pagedUrl = `${url}&pagina=${pagina}`;
            const res = await fetch(pagedUrl, {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            
            if (!res.ok) {
                results.push({ error: `API Error ${res.status}: ${await res.text().catch(() => '')}` });
                break;
            }
            
            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.itens || []);
            if (items.length === 0) break;
            
            for (const item of items) {
                const desc = item.descricao || item.description || '';
                const amount = item.valor_total || item.total || item.valor || item.pago || 0;
                const categories = item.categorias || (item.categoria ? [item.categoria] : []);
                const clientName = item.cliente?.nome || item.fornecedor?.nome || '';
                
                // Mapear correspondência por Jasmine, valor 2700, ou categoria PDD/Perda
                const isMatch = amount === 2700 || amount === -2700 || 
                                desc.toLowerCase().includes("jasmine") || 
                                clientName.toLowerCase().includes("jasmine") || 
                                categories.some((c: any) => {
                                    const cname = (c.nome || c.name || '').toLowerCase();
                                    return cname.includes("pdd") || cname.includes("perda") || cname.includes("06.8");
                                });
                                
                if (isMatch) {
                    results.push({
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
        
        return NextResponse.json({ 
            success: true, 
            totalMatchesFound: results.length,
            results 
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
