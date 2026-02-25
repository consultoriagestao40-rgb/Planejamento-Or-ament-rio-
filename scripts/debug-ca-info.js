const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenants = await prisma.tenant.findMany();
    for (const t of tenants) {
        if (t.name.includes("Empresa")) {
            console.log("Checking token for:", t.name, t.cnpj);
            
            const urls = [
                'https://api-v2.contaazul.com/v1/user/info',
                'https://api.contaazul.com/v1/user/info',
                'https://api-v2.contaazul.com/v1/tenants',
                'https://api.contaazul.com/v1/tenants',
                'https://api.contaazul.com/v1/empresa',
                'https://api-v2.contaazul.com/v1/empresa'
            ];
            
            let found = false;
            for (const url of urls) {
                try {
                    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${t.accessToken}` } });
                    if (res.ok) {
                        const data = await res.json();
                        console.log(`\nSUCCESS on ${url}:`);
                        console.log(JSON.stringify(data, null, 2));
                        found = true;
                    } else {
                        console.log(`Failed on ${url} (${res.status}) - ${res.statusText}`);
                    }
                } catch(e) {
                    console.log(`Error on ${url}:`, e.message);
                }
            }
            if (!found) console.log("Failed all endpoints for token");
        }
    }
}
run().catch(console.error).finally(() => prisma.$disconnect());
