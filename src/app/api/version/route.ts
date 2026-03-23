import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v58.7',
        lastUpdate: "2026-03-23 16:50 (Fix Database Schema Mismatch)"
    });
}
