const https = require('https');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { name: { contains: 'JVS FACILITIES' } } });
    const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/f9a440ef-19ec-4678-95d0-dda9b21fd04b';
    const options = { headers: { 'Authorization': `Bearer ${tenant.accessToken}` } };

    console.log("Fetching: " + url);
    https.get(url, options, (res) => {
        let body = '';
        console.log("Status: " + res.statusCode);
        res.on('data', d => body += d);
        res.on('end', () => {
            try { 
                console.log(JSON.stringify(JSON.parse(body), null, 2));
            } catch(e) {
                console.log("Response:", body);
            }
        });
    });
}
main().finally(() => setTimeout(() => prisma.$disconnect(), 3000));
