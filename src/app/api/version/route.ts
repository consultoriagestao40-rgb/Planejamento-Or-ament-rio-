import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v66.2',
        lastUpdate: '2026-03-26 - Monthly Budget Mapping in Modal & Whitelist Clean Tech Pro',
        status: 'stable'
    });
}
