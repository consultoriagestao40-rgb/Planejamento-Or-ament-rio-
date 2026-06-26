import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const jvsTenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const tenant = await prisma.tenant.findUnique({
            where: { id: jvsTenantId }
        });
        
        if (!tenant) {
            return NextResponse.json({ success: false, error: 'JVS Facilities tenant not found' });
        }

        const { token } = await getValidAccessToken(jvsTenantId);

        const testUrls = {
            ccSingularStandard: 'https://api-v2.contaazul.com/v1/centro-de-custo?tamanho_pagina=100',
            ccSingularTodos: 'https://api-v2.contaazul.com/v1/centro-de-custo?tamanho_pagina=100&status=TODOS',
            ccSingularAll: 'https://api-v2.contaazul.com/v1/centro-de-custo?tamanho_pagina=100&status=ALL',
            ccSingularFinanceiro: 'https://api-v2.contaazul.com/v1/financeiro/centro-de-custo?tamanho_pagina=100'
        };

        const results: Record<string, any> = {};

        for (const [key, url] of Object.entries(testUrls)) {
            try {
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    cache: 'no-store'
                });
                if (res.ok) {
                    results[key] = await res.json();
                } else {
                    const text = await res.text();
                    results[key] = { error: `HTTP ${res.status}`, details: text };
                }
            } catch (err: any) {
                results[key] = { error: 'FetchException', details: err.message };
            }
        }

        // Fetch from DB as well to compare
        const dbCCs = await prisma.costCenter.findMany({
            where: { tenantId: jvsTenantId }
        });

        return NextResponse.json({
            success: true,
            tenantName: tenant.name,
            results,
            dbCostCenters: dbCCs
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
