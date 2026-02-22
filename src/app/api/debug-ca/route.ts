import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function POST(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        const idEvento = '578d5465-b076-448e-8152-46aaa7190352';
        let parcelasData: any = null;
        try {
            const res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas?id_evento=${idEvento}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (res.ok) {
                parcelasData = await res.json();
            } else {
                parcelasData = { status: res.status, error: await res.text() };

                // fallback to the other URL format just in case
                const res2 = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${idEvento}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (res2.ok) {
                    parcelasData = await res2.json();
                } else {
                    parcelasData.fallbackError = await res2.text();
                }
            }
        } catch (err: any) {
            parcelasData = { catchError: err.message };
        }

        const payableRaw = parcelasData;

        return NextResponse.json({
            success: true,
            payableRaw
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
