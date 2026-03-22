import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL ? 'FOUND' : 'NOT FOUND',
        NODE_ENV: process.env.NODE_ENV,
        keys: Object.keys(process.env).filter(k => k.includes('PRISMA') || k.includes('POSTGRES'))
    });
}
