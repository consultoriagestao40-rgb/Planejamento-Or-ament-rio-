import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const contractsCount = await prisma.forecastContract.count();
        const contracts = await prisma.forecastContract.findMany({
            take: 10
        });
        const coefficientsCount = await prisma.forecastCoefficient.count();
        
        return NextResponse.json({
            success: true,
            contractsCount,
            coefficientsCount,
            contractsSample: contracts
        });
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            error: e.message
        });
    }
}
