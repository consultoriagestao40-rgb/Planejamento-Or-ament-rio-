import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/contaazul';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const state = Math.random().toString(36).substring(7);
        const url = getAuthUrl(state);
        return NextResponse.json({ success: true, url });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
