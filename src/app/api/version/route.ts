import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.0',
        lastUpdate: '2026-03-26 - Add Budget Comparison in Audit Modal & Global Inactive Unit Hiding',
        status: 'stable'
    });
}
