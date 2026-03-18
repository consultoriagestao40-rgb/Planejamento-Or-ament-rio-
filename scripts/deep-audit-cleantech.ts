
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const tenantName = "CLEAN TECH";
    const tenant = await prisma.tenant.findFirst({
        where: { name: { contains: tenantName } }
    });

    if (!tenant || !tenant.accessToken) {
        console.error("Tenant not found or no token");
        return;
    }

    console.log(`Auditing ${tenant.name} (${tenant.id})...`);

    const headers = {
        'Authorization': `Bearer ${tenant.accessToken}`,
        'Content-Type': 'application/json'
    };

    try {
        console.log("\n--- Sales (Sales API) ---");
        const salesRes = await fetch("https://api.contaazul.com/v2/sales?date_start=2026-01-01&date_end=2026-01-31&status=DONE", { headers });
        if (salesRes.ok) {
            const sales = await salesRes.json() as any[];
            console.log(`Found ${sales.length} sales`);
            let total = 0;
            sales.forEach((s: any) => {
                console.log(`  [Sale] Num: ${s.number} | Ref: ${s.reference} | Total: ${s.total} | Emiss: ${s.emission_date}`);
                total += s.total;
            });
            console.log(`Total Sales Revenue: R$ ${total.toLocaleString('pt-BR')}`);
        } else {
            console.error("Sales API Error:", salesRes.status);
        }

        console.log("\n--- Financials (Income API) ---");
        const finRes = await fetch("https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31", { headers });
        if (finRes.ok) {
            const data = await finRes.json() as any;
            const items = data.itens || [];
            console.log(`Found ${items.length} income items in CC Range`);
            let total = 0;
            items.forEach((item: any) => {
                const val = item.valor || 0;
                console.log(`  [Fin] Desc: ${item.descricao} | Value: ${val} | Due: ${item.data_vencimento} | Comp: ${item.data_competencia}`);
                total += val;
            });
            console.log(`Total Financial Income: R$ ${total.toLocaleString('pt-BR')}`);
        } else {
            console.error("Financials API Error:", finRes.status);
        }

    } catch (error: any) {
        console.error("Execution error:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
