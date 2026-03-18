
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const tenantName = "CLEAN TECH";
    const tenant = await prisma.tenant.findFirst({
        where: { name: { contains: tenantName } }
    });

    if (!tenant || !tenant.accessToken) {
        return NextResponse.json({ error: "Tenant or token not found" });
    }

    const headers = {
        'Authorization': `Bearer ${tenant.accessToken}`,
        'Content-Type': 'application/json'
    };

    const results: any = {
        tenant: tenant.name,
        sales_api: [],
        financials_api: []
    };

    try {
        // 1. Sales API
        const salesRes = await fetch("https://api.contaazul.com/v2/sales?date_start=2026-01-01&date_end=2026-01-31&status=DONE", { headers });
        if (salesRes.ok) {
            results.sales_api = await salesRes.json();
        }

        // 2. Financials API (Receivables)
        const finRes = await fetch("https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31", { headers });
        if (finRes.ok) {
            const data = await finRes.json();
            results.financials_api = data.itens || [];
        }

        return NextResponse.json(results);
    } catch (error: any) {
        return NextResponse.json({ error: error.message });
    }
}
