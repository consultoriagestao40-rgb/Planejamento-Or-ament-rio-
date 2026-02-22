import { getValidAccessToken } from './src/lib/services';

async function main() {
    try {
        const token = await getValidAccessToken();
        let page = 1;
        let hasMore = true;
        let mrV1Count = 0;
        let mrV2Count = 0;
        let otherMRV = 0;
        let total = 0;

        while (hasMore && page <= 50) {
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100&pagina=${page}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;
            
            items.forEach((item: any) => {
                total++;
                const ccs = item.centros_de_custo || [];
                ccs.forEach((c: any) => {
                    if (c.id === 'e00da426-abff-11ef-a549-17d078008a57') mrV1Count++;
                    else if (c.nome && c.nome.includes('MRV')) otherMRV++;
                });
            });
            if (items.length < 100) hasMore = false;
            page++;
        }
        console.log(`Total pagáveis: ${total}`);
        console.log(`MRV - ANITA GARIBALDI (ID e00da426...): ${mrV1Count}`);
        console.log(`Outros MRV: ${otherMRV}`);
    } catch(e) {
        console.error(e);
    }
}
main();
