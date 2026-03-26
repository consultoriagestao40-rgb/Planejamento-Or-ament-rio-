import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const results: any = {
        timestamp: new Date().toISOString(),
        version: 'v65.3',
        network: 'ONLINE',
        variables: {
            DATABASE_URL: !!process.env.DATABASE_URL,
            POSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL,
            POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
            DATABASE_URL_UNPOOLED: !!process.env.DATABASE_URL_UNPOOLED,
        },
        dbTest: 'checking'
    };

    try {
        const fetchRes = await fetch('https://www.google.com', { signal: AbortSignal.timeout(3000) });
        results.googlePing = fetchRes.ok ? 'SUCCESS' : 'FAILED';
    } catch (e: any) {
        results.googlePing = `ERROR: ${e.message}`;
    }

    try {
        const start = Date.now();
        // Trying a raw query to bypass any model-specific issues
        const dbRes = await prisma.$queryRaw`SELECT 1 as result`;
        results.dbTest = 'CONNECTED';
        results.dbLatency = `${Date.now() - start}ms`;
        results.dbResult = dbRes;
    } catch (e: any) {
        results.dbTest = 'FAILED';
        results.dbError = e.message;
        results.dbErrorType = e.constructor.name;
        
        // Breakdown the connection string host for the user to verify
        const url = process.env.POSTGRES_URL_NON_POOLING || '';
        const hostMatch = url.match(/@([^/:]+)/);
        results.attemptedHost = hostMatch ? hostMatch[1] : 'NOT_FOUND';
    }

    return NextResponse.json(results);
}
