import { getValidAccessToken } from './src/lib/services';
async function main() {
    try {
        const token = await getValidAccessToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        // Let's try to fetch v1/financeiro/contas-a-pagar directly (maybe without eventos-financeiros)
        const res = await fetch('https://api-v2.contaazul.com/v1/financeiro/contas-a-pagar', { headers });
        console.log("contas-a-pagar status:", res.status);
        if (res.ok) {
            const data = await res.json();
            console.log(JSON.stringify(data[0] || data.itens?.[0], null, 2));
        }

    } catch (e) { console.error(e); }
}
main();
