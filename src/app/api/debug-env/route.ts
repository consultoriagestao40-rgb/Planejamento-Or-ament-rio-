import { NextResponse } from 'next/server';

export async function GET() {
    const url = process.env.POSTGRES_URL_NON_POOLING || '';
    const hostMatch = url.match(/@([^/:]+)/);
    const userMatch = url.match(/:\/\/([^:]+):/);
    return NextResponse.json({ 
        DATABASE_URL: !!process.env.DATABASE_URL,
        POSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL,
        POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
        attemptedHost: hostMatch ? hostMatch[1] : 'NOT_FOUND',
        attemptedUser: userMatch ? userMatch[1] : 'NOT_FOUND',
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV
    });
}
