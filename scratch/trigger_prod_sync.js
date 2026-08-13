async function main() {
    const url = 'https://planejamento-or-ament-rio.vercel.app/api/cron/sync?tenantId=all&year=2026&startMonth=6&endMonth=6';
    console.log(`Disparando sincronização de Junho/2026 em produção: ${url}`);
    
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log(`Status do retorno: ${res.status}`);
        const data = await res.json();
        console.log('Resposta da Sincronização:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Erro ao disparar sync:', e);
    }
}

main();
