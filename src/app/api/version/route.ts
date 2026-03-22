import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v51.4-debug-2',
        timestamp: new Date().toISOString()
    });
}
