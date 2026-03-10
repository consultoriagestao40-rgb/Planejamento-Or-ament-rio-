const https = require('https');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/f9a440ef-19ec-4678-95d0-dda9b21fd04b';
    const options = { headers: { 'Authorization': `Bearer ${tenant.accessToken}` } };

    https.get(url, options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => console.log(JSON.stringify(JSON.parse(body), null, 2)));
    });
}
main().finally(() => prisma.$disconnect());
