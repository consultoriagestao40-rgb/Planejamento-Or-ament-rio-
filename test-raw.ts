const fs = require('fs');
import { getValidAccessToken } from './src/lib/services';
async function main() {
    try {
        const token = await getValidAccessToken();
        const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31&tamanho_pagina=100';
        let items: any[] = [];
        for(let i=1; i<=10; i++) {
            const res = await fetch(url + '&pagina=' + i, { headers: { 'Authorization': `Bearer ${token}` } });
            if(!res.ok) break;
            const data = await res.json();
            if(!data.itens || data.itens.length === 0) break;
            items = items.concat(data.itens);
        }
        fs.writeFileSync('jan_payables.json', JSON.stringify(items, null, 2));
    } catch(e) { console.error(e); }
}
main();
