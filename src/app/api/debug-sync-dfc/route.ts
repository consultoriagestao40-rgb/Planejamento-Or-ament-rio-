import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        console.log(line);
        logs.push(line);
    };

    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId') || 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; 
        
        pushLog(`[Debug URLs] Buscando token...`);
        const { token } = await getValidAccessToken(tenantId);
        pushLog(`[Debug URLs] Token obtido. testando endpoints...`);

        const paths = [
            '/v1/contas-financeiras',
            '/v1/financeiro/contas-financeiras',
            '/v1/contas',
            '/v1/financeiro/contas',
            '/v1/contas-correntes',
            '/v1/financeiro/contas-correntes',
            '/v1/financeiro/eventos-financeiros/contas-financeiras',
            '/v1/financeiro/eventos-financeiros/saldo-inicial?data_inicio=2026-01-01&data_fim=2026-01-31',
            '/v1/financeiro/eventos-financeiros/saldo-inicial'
        ];

        const results: Record<string, { status: number, bodySample: string }> = {};

        for (const path of paths) {
            try {
                const url = `https://api-v2.contaazul.com${path}`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    cache: 'no-store'
                });
                const bodyText = await res.text().catch(() => '');
                results[path] = {
                    status: res.status,
                    bodySample: bodyText.substring(0, 300)
                };
                pushLog(`Path: ${path} -> Status: ${res.status}`);
            } catch (e: any) {
                results[path] = {
                    status: 500,
                    bodySample: e.message
                };
                pushLog(`Path: ${path} -> ERROR: ${e.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            logs,
            results
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message, logs }, { status: 500 });
    }
}
