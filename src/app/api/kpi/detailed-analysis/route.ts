import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '0', 10);

        if (!tenantId || !month || !year) {
            return NextResponse.json({ success: false, error: 'Parâmetros ausentes' }, { status: 400 });
        }

        const analyses = await prisma.detailedAnalysis.findMany({
            where: {
                tenantId,
                month,
                year
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return NextResponse.json({ success: true, data: analyses });
    } catch (e: any) {
        console.error('[API DETAILED ANALYSIS GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            id,
            tenantId,
            month,
            year,
            categoryId,
            filterTenantId,
            filterCCId,
            chartType,
            onlyRealized = false,
            showAtingido = false,
            pctOfRevenue = false,
            analysisText = ''
        } = body;

        if (!tenantId || !month || !year || !categoryId || !filterTenantId || !chartType) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        let detailedAnalysis;

        if (id) {
            detailedAnalysis = await prisma.detailedAnalysis.update({
                where: { id },
                data: {
                    categoryId,
                    filterTenantId,
                    filterCCId: filterCCId === 'ALL' || !filterCCId ? null : filterCCId,
                    chartType,
                    onlyRealized: !!onlyRealized,
                    showAtingido: !!showAtingido,
                    pctOfRevenue: !!pctOfRevenue,
                    analysisText: analysisText || ''
                }
            });
        } else {
            detailedAnalysis = await prisma.detailedAnalysis.create({
                data: {
                    tenantId,
                    month: parseInt(month, 10),
                    year: parseInt(year, 10),
                    categoryId,
                    filterTenantId,
                    filterCCId: filterCCId === 'ALL' || !filterCCId ? null : filterCCId,
                    chartType,
                    onlyRealized: !!onlyRealized,
                    showAtingido: !!showAtingido,
                    pctOfRevenue: !!pctOfRevenue,
                    analysisText: analysisText || ''
                }
            });
        }

        return NextResponse.json({ success: true, data: detailedAnalysis });
    } catch (e: any) {
        console.error('[API DETAILED ANALYSIS POST] Error:', e.message);
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

        await prisma.detailedAnalysis.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[API DETAILED ANALYSIS DELETE] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
