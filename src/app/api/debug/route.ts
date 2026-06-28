import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const contracts = await prisma.forecastContract.findMany();
        return NextResponse.json({ success: true, contracts });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
