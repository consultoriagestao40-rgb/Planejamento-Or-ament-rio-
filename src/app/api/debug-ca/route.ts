import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        async function runScan() {
            let res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/contas-a-pagar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                return await res.json();
            } else {
                return { status: res.status, error: await res.text() };
            }
        }

        const payables = await runScan();

        return NextResponse.json({
            success: true,
            payables
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
