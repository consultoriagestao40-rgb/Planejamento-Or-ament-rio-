const fs = require('fs');
const path = require('path');

// Manually parse .env.development.local
try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.development.local'), 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
} catch (err) {
    console.error("Could not load .env.development.local:", err.message);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
    
    const records = await prisma.realizedEntry.findMany({
        where: {
            tenantId,
            customer: { contains: 'PENHA' }
        }
    });

    console.log("=== REGISTROS DA PENHA NO BANCO ===");
    console.log(JSON.stringify(records, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
