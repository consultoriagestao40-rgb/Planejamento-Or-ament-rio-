import { getValidAccessToken } from './src/lib/services';
async function main() {
    const token = await getValidAccessToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100';
    
    // fetch page 1
    const res = await fetch(url + '&pagina=1', { headers });
    const data = await res.json();
    for(const item of data.itens) {
        const val = item.valor || item.total || item.valor_original;
        if(val > 18000 && val < 20000) {
            console.log("FOUND 18k TX ID:", item.id);
            const detailRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/${item.id}`, { headers });
            const detail = await detailRes.json();
            console.log(JSON.stringify(detail, null, 2));
            return;
        }
    }
}
main();
