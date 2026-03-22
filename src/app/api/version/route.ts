import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v51.6',
        timestamp: new Date().toISOString()
    });
}
