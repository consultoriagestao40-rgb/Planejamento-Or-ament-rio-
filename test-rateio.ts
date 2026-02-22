import { getValidAccessToken } from './src/lib/services';
async function main() {
    try {
        const token = await getValidAccessToken();
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        const items = data.itens || [];
        for (const item of items) {
            if (item.centros_de_custo && item.centros_de_custo.length > 1) {
                console.log("RATEIO FOUND:");
                console.log(JSON.stringify(item.centros_de_custo, null, 2));
                console.log("TOTAL VALOR:", item.valor);
                break;
            }
        }
    } catch(e) { console.error(e); }
}
main();
