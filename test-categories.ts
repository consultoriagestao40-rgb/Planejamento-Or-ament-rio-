import { getValidAccessToken } from './src/lib/services';

async function main() {
    try {
        const token = await getValidAccessToken();
        let page = 1;
        let hasMore = true;
        
        while (hasMore && page <= 20) {
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100&pagina=${page}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;
            
            items.forEach((item: any) => {
                const ccs = item.centros_de_custo || [];
                const isDPG = ccs.some((c: any) => c.id === '572262ec-5b2b-11f0-be76-0ff178060de5');
                if (isDPG) {
                    console.log(`[DPG Payable] ID: ${item.id} | Desc: ${item.descricao} | Valor: ${item.valor} | Cat: ${JSON.stringify(item.categorias)} | Status: ${item.status}`);
                }
            });
            if (items.length < 100) hasMore = false;
            page++;
        }
    } catch(e) {
        console.error(e);
    }
}
main();
