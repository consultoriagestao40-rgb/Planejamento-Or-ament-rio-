import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ 
        version: 'v52.0',
        timestamp: new Date().toISOString()
    });
}
