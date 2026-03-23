import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v55.0',
        lastUpdate: "2026-03-22 22:40 (UI Simplification: Removed Cash/Accrual Toggle)"
    });
}
