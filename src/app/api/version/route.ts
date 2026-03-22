import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v51.7',
        timestamp: new Date().toISOString()
    });
}
