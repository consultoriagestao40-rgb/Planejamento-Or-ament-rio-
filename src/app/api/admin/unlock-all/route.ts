import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user || user.role !== 'MASTER') {
            return NextResponse.json({ success: false, error: 'Apenas Master pode realizar esta operação' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

        // Update all locks to isLocked: false, status: PENDING
        await (prisma as any).costCenterLock.updateMany({
            where: { year },
            data: {
                isLocked: false,
                status: 'PENDING',
                n1ApprovedBy: null,
                n1ApprovedAt: null,
                n2ApprovedBy: null,
                n2ApprovedAt: null
            }
        });

        return NextResponse.json({ success: true, message: 'Todos os orçamentos foram destrancados para o ano ' + year });

    } catch (error: any) {
        console.error('Error in unlock-all API:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
