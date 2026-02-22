import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        async function runScan() {
            let res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/934386fc-baff-45a9-9fe3-978643329f27`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                return await res.json();
            } else {
                return { status: res.status, error: await res.text() };
            }
        }

        async function runScan2() {
            let res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/578d5465-b076-448e-8152-46aaa7190352`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                return await res.json();
            } else {
                return { status: res.status, error: await res.text() };
            }
        }

        const detail1 = await runScan();
        const detail2 = await runScan2();

        return NextResponse.json({
            success: true,
            detail1, detail2
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
