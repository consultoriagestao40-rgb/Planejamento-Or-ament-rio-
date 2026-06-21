import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId') || 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; 
        const { token } = await getValidAccessToken(tenantId);

        // Formato ISO 8601 exato exigido pela API da Conta Azul (ex: 2025-10-20T07:59:59)
        const dataInicio = searchParams.get('data_inicio') || '2026-01-01T00:00:00';
        const dataFim = searchParams.get('data_fim') || '2026-01-01T23:59:59';
        const customPath = searchParams.get('path');
        
        const path = customPath || `/v1/financeiro/eventos-financeiros/saldo-inicial?data_inicio=${dataInicio}&data_fim=${dataFim}`;
        const url = `https://api-v2.contaazul.com${path}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        
        const status = res.status;
        const bodyText = await res.text().catch(() => '');
        
        let bodyJson = null;
        try {
            bodyJson = JSON.parse(bodyText);
        } catch (e) {}

        return NextResponse.json({
            success: true,
            status,
            path,
            bodyJson,
            bodyRaw: bodyJson ? undefined : bodyText
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
