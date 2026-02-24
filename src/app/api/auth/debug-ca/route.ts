import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            where: {
                name: {
                    contains: 'Empresa',
                }
            }
        });

        const reports = [];

        for (const t of tenants) {
            const urls = [
                'https://api-v2.contaazul.com/v1/user/info',
                'https://api.contaazul.com/v1/user/info',
                'https://api-v2.contaazul.com/v1/tenants',
                'https://api.contaazul.com/v1/tenants',
            ];

            const tokenReport: any = { company: t.name, responses: {} };

            let validToken = t.accessToken;
            try {
                const result = await getValidAccessToken(t.id);
                validToken = result.token;
            } catch (e: any) {
                tokenReport.tokenRefreshError = e.message;
            }

            for (const url of urls) {
                try {
                    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${validToken}` } });
                    if (res.ok) {
                        tokenReport.responses[url] = await res.json();
                    } else {
                        tokenReport.responses[url] = `HTTP ${res.status}`;
                    }
                } catch (e: any) {
                    tokenReport.responses[url] = `Error: ${e.message}`;
                }
            }
            reports.push(tokenReport);
        }

        return NextResponse.json({ success: true, count: tenants.length, reports });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
