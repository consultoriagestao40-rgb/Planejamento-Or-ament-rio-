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
    const targetTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities
    
    console.log("\n=== TÍTULOS A RECEBER DE JULHO/2026 NO BANCO (EXEMPLOS) ===");
    const recs = await prisma.realizedEntry.findMany({
        where: { tenantId: targetTenantId, viewMode: 'previsto_receber', year: 2026, month: 7 },
        take: 10
    });
    recs.forEach(r => {
        console.log(`- Data: ${r.date.toLocaleDateString('pt-BR')} | Cliente: ${r.customer || 'Desconhecido'} | Descrição: ${r.description} | Valor: R$ ${r.amount.toFixed(2)}`);
    });

    console.log("\n=== TÍTULOS A PAGAR DE JULHO/2026 NO BANCO (EXEMPLOS) ===");
    const pays = await prisma.realizedEntry.findMany({
        where: { tenantId: targetTenantId, viewMode: 'previsto_pagar', year: 2026, month: 7 },
        take: 10
    });
    pays.forEach(p => {
        console.log(`- Data: ${p.date.toLocaleDateString('pt-BR')} | Fornecedor: ${p.customer || 'Desconhecido'} | Descrição: ${p.description} | Valor: R$ ${p.amount.toFixed(2)}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
