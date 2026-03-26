import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.4',
        lastUpdate: '2026-03-26 - RECOVERY: Modal Budget Mapping by TenantId & Robust Normalization',
        status: 'stable'
    });
}
