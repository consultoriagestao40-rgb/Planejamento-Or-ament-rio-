import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const tenants = await prisma.tenant.findMany({
            where: { accessToken: { not: null } }
        });

        const results: any[] = [];

        for (const tenant of tenants) {
            if (!tenant.name.includes("JVS FACILITIES")) continue;
            
            let page = 1;
            let hasMore = true;

            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/f9a440ef-19ec-4678-95d0-dda9b21fd04b`;

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
                cache: 'no-store'
            });

            if (!res.ok) { continue; }

            const data = await res.json();
            
            results.push({
                tenant: tenant.name,
                transaction: data
            });
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
