import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Connecting...");
    const tenants = await prisma.tenant.findMany();
    console.log(`Found ${tenants.length} tenants`);
    for (const t of tenants) {
        console.log(`- ID: ${t.id} Name: ${t.name} CNPJ: ${t.cnpj}`);
        if (t.accessToken && (t.name.includes("Empresa") || t.name.includes("SPOT"))) {
            console.log(`  -> Testing token: ${t.accessToken.substring(0, 10)}...`);
            const urls = [
                'https://api-v2.contaazul.com/v1/user/info',
                'https://api.contaazul.com/v1/user/info',
                'https://api-v2.contaazul.com/v1/tenants',
                'https://api.contaazul.com/v1/tenants',
            ];
            for (const url of urls) {
                try {
                    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${t.accessToken}` } });
                    if (res.ok) {
                        const data = await res.json();
                        console.log(`  [OK] ${url}:`, JSON.stringify(data).substring(0, 500));
                    } else {
                        console.log(`  [FAIL] ${url}: ${res.status}`);
                    }
                } catch (e: any) {
                    console.log(`  [ERR] ${url}: ${e.message}`);
                }
            }
        }
    }
}
run().catch(console.error).finally(() => prisma.$disconnect());
