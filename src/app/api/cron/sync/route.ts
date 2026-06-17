import { NextResponse } from 'next/server';
import { runCronSync } from '@/lib/cronSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max on Vercel Pro

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const paramYear = searchParams.get('year');
        const reqYear = paramYear ? parseInt(paramYear, 10) : new Date().getFullYear();
        const tenantId = searchParams.get('tenantId') || undefined;
        const startMonth = parseInt(searchParams.get('startMonth') || '1', 10);
        const endMonth = parseInt(searchParams.get('endMonth') || '12', 10);

        const result = await runCronSync(reqYear, tenantId, startMonth, endMonth);
        return NextResponse.json(result);

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
