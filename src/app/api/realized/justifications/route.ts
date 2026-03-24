import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const categoryId = searchParams.get('categoryId');
        const costCenterId = searchParams.get('costCenterId'); // Optional
        const month = parseInt(searchParams.get('month') || '', 10);
        const year = parseInt(searchParams.get('year') || '', 10);
        const viewMode = searchParams.get('viewMode') || 'competencia';

        if (!tenantId || !categoryId || isNaN(month) || isNaN(year)) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const queryCC = (costCenterId && costCenterId !== 'DEFAULT' && costCenterId !== 'ALL') 
            ? costCenterId 
            : (costCenterId === 'ALL' ? undefined : 'DEFAULT');

        const filter: any = {
            tenantId,
            categoryId,
            month,
            year,
            viewMode
        };

        if (queryCC) {
            filter.costCenterId = queryCC;
        }

        const justifications = await (prisma as any).realizedJustification.findMany({
            where: filter,
            include: {
                costCenter: { select: { name: true } },
                tenant: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, justifications });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { 
            tenantId, 
            categoryId, 
            costCenterId, 
            month, 
            year, 
            viewMode, 
            content, 
            userName 
        } = body;

        if (!tenantId || !categoryId || !content || !userName) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        const justification = await (prisma as any).realizedJustification.create({
            data: {
                tenantId,
                categoryId,
                costCenterId: (costCenterId && costCenterId !== 'DEFAULT') ? costCenterId : 'DEFAULT',
                month: parseInt(month.toString(), 10),
                year: parseInt(year.toString(), 10),
                viewMode: viewMode || 'competencia',
                content,
                userName
            }
        });

        return NextResponse.json({ success: true, justification });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
