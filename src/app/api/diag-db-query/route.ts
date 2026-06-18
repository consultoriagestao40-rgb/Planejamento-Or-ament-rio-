import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; // JVS Facilities

        // 1. Get valid access token
        const { token, tenant } = await getValidAccessToken(tenantId);

        // 2. Fetch company info from Conta Azul API
        const endpoints = [
            'https://api.contaazul.com/v1/user/info',
            'https://api.contaazul.com/v1/tenants'
        ];

        const results: any = {};

        for (const url of endpoints) {
            try {
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    results[url] = await res.json();
                } else {
                    results[url] = { error: `HTTP ${res.status}: ${await res.text()}` };
                }
            } catch (err: any) {
                results[url] = { error: err.message };
            }
        }

        return NextResponse.json({
            success: true,
            tenantNameInDb: tenant.name,
            tenantCnpjInDb: tenant.cnpj,
            tokenExpiresAt: tenant.tokenExpiresAt,
            contaAzulApiResponses: results
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
