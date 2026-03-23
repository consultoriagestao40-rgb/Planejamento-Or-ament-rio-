import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v58.1',
        lastUpdate: "2026-03-23 16:00 (Updated Analysis Icons to Pencil)"
    });
}
