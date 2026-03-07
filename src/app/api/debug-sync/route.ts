import { NextResponse } from 'next/server';
import { runCronSync } from '@/lib/cronSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const paramYear = searchParams.get('year');
        const reqYear = paramYear ? parseInt(paramYear, 10) : new Date().getFullYear();

        console.log(`[DEBUG] Starting debug sync for year ${reqYear}`);
        const { prisma } = await import('@/lib/prisma');
        const count = await prisma.realizedEntry.groupBy({
            by: ['viewMode'],
            _count: true
        });
        console.log('[DEBUG] DB Counts:', JSON.stringify(count, null, 2));

        return NextResponse.json(count);
    } catch (e: any) {
        console.error('[DEBUG] Sync error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
