import { getValidAccessToken } from './src/lib/services';
async function main() {
    try {
        const token = await getValidAccessToken();
        let matches = 0;
        let total = 0;
        const ccsEncontrados: any = {};
        for(let endpoint of ['contas-a-pagar', 'contas-a-receber']) {
            for (let i = 1; i <= 20; i++) {
                let url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${endpoint}/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&tamanho_pagina=100&pagina=${i}`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) break;
                const data = await res.json();
                const items = data.itens || [];
                if (items.length === 0) break;
                items.forEach((item: any) => {
                    const ccs = item.centros_de_custo || [];
                    if (ccs.length > 0 && ccs[0].id === '572262ec-5b2b-11f0-be76-0ff178060de5') {
                        console.log(`[${endpoint.toUpperCase()}] ID: ${item.id} | Desc: ${item.descricao} | Cat: ${JSON.stringify(item.categorias)} | Val: ${item.valor} | MO: ${new Date(item.data_vencimento || item.vencimento).getMonth()}`);
                    }
                });
            }
        }
    } catch(e) { console.error(e); }
}
main();
