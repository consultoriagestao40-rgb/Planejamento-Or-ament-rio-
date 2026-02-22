import { getValidAccessToken } from './src/lib/services';
async function main() {
    try {
        const token = await getValidAccessToken();
        const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100';
        let items: any[] = [];
        for (let i = 1; i <= 10; i++) {
            const res = await fetch(url + '&pagina=' + i, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) break;
            const data = await res.json();
            if (!data.itens || data.itens.length === 0) break;
            for (const item of data.itens) {
                const amount = item.valor || item.valor_original || item.total || 0;
                if ((amount > 18000 && amount < 19000) || (amount > 39000 && amount < 40000)) {
                    console.log(`--- FOUND RATEIO --- ID: ${item.id} | Val: ${amount}`);
                    console.log(JSON.stringify(item.centros_de_custo, null, 2));
                    console.log(JSON.stringify(item.itens_rateio, null, 2));
                }
            }
        }
    } catch (e) { console.error(e); }
}
main();
