import { NextResponse } from 'next/server';
import { getValidAccessToken } from '../../../../lib/services';

const CLEAN_TECH_ID = '1fa165e3-178f-4d8f-ae7c-434c720c82dd';

export async function GET() {
    try {
        const { token } = await getValidAccessToken(CLEAN_TECH_ID);
        
        // Consultar o detalhe da parcela da Jasmine com status LOST
        const targetParcelId = "ad8dab04-51fc-4edb-91eb-93ad66f7da90";
        const detailUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${targetParcelId}`;
        
        const detailRes = await fetch(detailUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        
        let parcelDetail = null;
        if (detailRes.ok) {
            parcelDetail = await detailRes.json();
        } else {
            parcelDetail = { error: `Failed to fetch parcel detail: ${detailRes.status} - ${await detailRes.text().catch(() => '')}` };
        }
        
        return NextResponse.json({ 
            success: true, 
            parcelId: targetParcelId,
            parcelDetail 
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
