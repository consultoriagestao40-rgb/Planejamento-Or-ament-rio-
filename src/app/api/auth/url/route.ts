import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/contaazul';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        
        // Encode tenantId inside OAuth state parameter to identify which tenant is reconnecting
        const rand = Math.random().toString(36).substring(7);
        const state = tenantId ? `${rand}___${tenantId}` : rand;
        
        const url = getAuthUrl(state);
        return NextResponse.redirect(url);
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
