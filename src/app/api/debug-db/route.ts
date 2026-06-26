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

        // Fetch cost centers standard
        const ccRes = await fetch('https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100', { 
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        
        let rawCCsApi: any = null;
        if (ccRes.ok) {
            rawCCsApi = await ccRes.json();
        } else {
            const errText = await ccRes.text();
            rawCCsApi = { error: `HTTP ${ccRes.status}`, details: errText };
        }

        // Fetch cost centers with status=ALL in case Conta Azul supports it
        const ccAllRes = await fetch('https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100&status=ALL', { 
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        
        let rawCCsApiAll: any = null;
        if (ccAllRes.ok) {
            rawCCsApiAll = await ccAllRes.json();
        } else {
            const errText = await ccAllRes.text();
            rawCCsApiAll = { error: `HTTP ${ccAllRes.status}`, details: errText };
        }

        // Fetch from DB as well to compare
        const dbCCs = await prisma.costCenter.findMany({
            where: { tenantId: jvsTenantId }
        });

        return NextResponse.json({
            success: true,
            tenantName: tenant.name,
            apiCostCentersStandard: rawCCsApi,
            apiCostCentersStatusAll: rawCCsApiAll,
            dbCostCenters: dbCCs
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
