import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const results: any = {
        timestamp: new Date().toISOString(),
        networkStatus: 'checking',
        dbStatus: 'checking'
    };

    // 1. Test External Network
    try {
        const fetchStart = Date.now();
        const res = await fetch('https://www.google.com', { signal: AbortSignal.timeout(5000) });
        results.networkStatus = res.ok ? 'ONLINE' : 'FETCH_FAILED';
        results.networkLatency = `${Date.now() - fetchStart}ms`;
    } catch (e: any) {
        results.networkStatus = `ERROR: ${e.message}`;
    }

    // 2. Test Prisma Connection
    try {
        const dbStart = Date.now();
        const tenantCount = await prisma.tenant.count();
        results.dbStatus = 'CONNECTED';
        results.tenantCount = tenantCount;
        results.dbLatency = `${Date.now() - dbStart}ms`;
    } catch (e: any) {
        results.dbStatus = `FAILED: ${e.message}`;
        results.dbErrorType = e.constructor.name;
    }

    return NextResponse.json(results);
}
