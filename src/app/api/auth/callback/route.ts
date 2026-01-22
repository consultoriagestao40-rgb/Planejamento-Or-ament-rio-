import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);

    // EXTREME DEBUG: Just show we got here
    return NextResponse.json({
        status: 'ALIVE',
        message: 'O Callback foi acionado com sucesso!',
        receivedParams: searchParams
    });
}
