import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const year = parseInt(searchParams.get('year') || '0', 10);

        if (!tenantId || !year) {
            return NextResponse.json({ success: false, error: 'Parâmetros ausentes' }, { status: 400 });
        }

        const where: any = { startYear: year };
        if (tenantId !== 'ALL') {
            where.tenantId = tenantId;
        }

        const contracts = await prisma.forecastContract.findMany({
            where,
            include: {
                tenant: {
                    select: { name: true }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return NextResponse.json({ success: true, data: contracts });
    } catch (e: any) {
        console.error('[API FORECAST CONTRACTS GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            id,
            tenantId,
            name,
            value,
            startMonth,
            startYear,
            probability,
            status
        } = body;

        if (!tenantId || !name || value === undefined || !startMonth || !startYear || probability === undefined || !status) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        let contract;

        if (id) {
            contract = await prisma.forecastContract.update({
                where: { id },
                data: {
                    tenantId,
                    name,
                    value: parseFloat(value),
                    startMonth: parseInt(startMonth, 10),
                    startYear: parseInt(startYear, 10),
                    probability: parseFloat(probability),
                    status
                }
            });
        } else {
            contract = await prisma.forecastContract.create({
                data: {
                    tenantId,
                    name,
                    value: parseFloat(value),
                    startMonth: parseInt(startMonth, 10),
                    startYear: parseInt(startYear, 10),
                    probability: parseFloat(probability),
                    status
                }
            });
        }

        return NextResponse.json({ success: true, data: contract });
    } catch (e: any) {
        console.error('[API FORECAST CONTRACTS POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID ausente' }, { status: 400 });
        }

        await prisma.forecastContract.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[API FORECAST CONTRACTS DELETE] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
