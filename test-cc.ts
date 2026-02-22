import { getValidAccessToken } from './src/lib/services';
import { prisma } from './src/lib/prisma';

async function run() {
    const { token } = await getValidAccessToken();
    const res = await fetch('https://api-v2.contaazul.com/v1/centro-de-custo', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    console.log(JSON.stringify(data[0] || data.itens?.[0], null, 2));
}
run();
