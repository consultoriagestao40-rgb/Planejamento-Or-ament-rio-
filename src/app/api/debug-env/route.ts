import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const contracts = await prisma.forecastContract.findMany();
        const coefficients = await prisma.forecastCoefficient.findMany();
        return NextResponse.json({ success: true, contracts, coefficients });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}

