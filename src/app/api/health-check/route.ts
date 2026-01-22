import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'API Routing is working correctly on this path'
    });
}
