
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Iniciando Debug da Diferença (Jan/2026)...");

    const tenant = await prisma.tenant.findFirst();
    if (!tenant || !tenant.accessToken) {
        console.error("❌ Token não encontrado.");
        return;
    }

    const token = tenant.accessToken;
    const start = '2026-01-01';
    const end = '2026-01-31'; // Vamos buscar por COMPÊTENCIA se possível, ou Vencimento largo

    // SWAPPING TO DETAILS BY ID (PINHAIS ID from previous run)
    const pinhaisId = "9cc4fbe1-7a6e-4277-8b4e-d2ba0656442d";

    // Potential Endpoints to Try
    const urls = [
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${pinhaisId}`,
        `https://api-v2.contaazul.com/v1/financeiro/contas-a-receber/${pinhaisId}`,
        `https://api-v2.contaazul.com/v1/receivables/${pinhaisId}`,
        `https://api-v2.contaazul.com/v1/financial/receivables/${pinhaisId}`,
        `https://api.contaazul.com/v1/sales/${pinhaisId}`, // Just in case v1 works
        `https://api.contaazul.com/v1/lancamentos/${pinhaisId}`
    ];

    // Decode Token to check scopes
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        console.log(`🔐 Token Scopes: ${payload.scope || payload.authorities}`);
    } catch (e) { console.log("⚠️ Could not decode token"); }

    for (const url of urls) {
        console.log(`📡 Trying: ${url}`);
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            console.log(`   Status: ${res.status}`);
            if (res.ok) {
                const item = await res.json();
                console.log(`\n✅ SUCCESS! 🔹 FULL DETAIL OBJECT:`, JSON.stringify(item, null, 2));
                break;
            }
        } catch (e: any) {
            console.log(`   Error: ${e.message}`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
