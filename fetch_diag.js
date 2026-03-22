const https = require('https');

async function fetchDiagnostics() {
    console.log("Aguardando o Vercel fazer o deploy da rota de diagnóstico...");
    
    for (let i = 0; i < 15; i++) {
        try {
            const res = await new Promise((resolve, reject) => {
                https.get('https://planejamento-or-ament-rio.vercel.app/api/diagnostic-dre', (resp) => {
                    let data = '';
                    resp.on('data', (chunk) => { data += chunk; });
                    resp.on('end', () => { resolve({ statusCode: resp.statusCode, data }); });
                }).on('error', (err) => { reject(err); });
            });

            if (res.statusCode === 200) {
                const json = JSON.parse(res.data);
                if (json.success) {
                    console.log("\n✅ DADOS DA PRODUÇÃO OBTIDOS COM SUCESSO!\n");
                    console.log(`TOTAL RECEITA: R$ ${json.totalRevenue}`);
                    console.log(`TOTAL DESPESAS: R$ ${json.totalExpense}\n`);
                    console.log("RESUMO POR CATEGORIA:");
                    for (const catName in json.categoryTotals) {
                        const info = json.categoryTotals[catName];
                        console.log(` - ${catName}: R$ ${info.total.toFixed(2)} (${info.ids.length} lançamentos)`);
                    }
                    console.log("\nDETALHES DOS LANÇAMENTOS DE RECEITA E SALÁRIOS:");
                    json.detailLogs.forEach(l => {
                        console.log(` > [${l.cat}] R$ ${l.amount.toFixed(2)} | CC: ${l.loc} | Desc: ${l.desc}`);
                    });
                    return;
                }
            }
        } catch (e) {
            console.log("Erro de rede, tentando novamente...");
        }
        await new Promise(r => setTimeout(r, 10000));
    }
    console.log("Timeout atingido.");
}

fetchDiagnostics();
