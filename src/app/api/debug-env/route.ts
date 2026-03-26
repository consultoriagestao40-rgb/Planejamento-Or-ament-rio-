import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        DATABASE_URL: !!process.env.DATABASE_URL,
        POSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL,
        POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV
    });
}
