import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '0', 10);
        const categoryId = searchParams.get('categoryId');

        if (!tenantId || !year) {
            return NextResponse.json({ success: false, error: 'Parâmetros tenantId e year são obrigatórios' }, { status: 400 });
        }

        const whereClause: any = {
            tenantId,
            year
        };

        if (month > 0) {
            whereClause.month = month;
        }

        if (categoryId) {
            if (categoryId.startsWith('synth-')) {
                const codePrefix = categoryId.replace('synth-', '');
                const children = await prisma.category.findMany({
                    where: {
                        tenantId,
                        name: { startsWith: codePrefix }
                    },
                    select: { id: true }
                });
                const catIds = children.map(c => c.id);
                whereClause.categoryId = { in: catIds };
            } else {
                const catIds = categoryId.split(',').map(id => id.trim()).filter(Boolean);
                const expandedIds = new Set<string>();
                catIds.forEach(id => {
                    expandedIds.add(id);
                    expandedIds.add(`${tenantId}:${id}`);
                    if (id.includes(':')) {
                        expandedIds.add(id.split(':')[1]);
                    }
                });
                whereClause.categoryId = { in: Array.from(expandedIds) };
            }
        }

        const deviations = await prisma.deviationAnalysis.findMany({
            where: whereClause,
            include: {
                category: {
                    select: { id: true, name: true }
                },
                responsible: {
                    select: { id: true, name: true, email: true, avatarUrl: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: deviations });
    } catch (e: any) {
        console.error('[API DEVIATIONS GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            id,
            tenantId,
            categoryId,
            month,
            year,
            deviationType,
            description,
            correctionAction,
            responsibleId,
            responsibleName,
            dueDate,
            isResolved
        } = body;

        if (!tenantId || !categoryId || !month || !year || !deviationType || !description || !correctionAction) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        const cleanCategoryId = categoryId.includes(':') ? categoryId : `${tenantId}:${categoryId}`;

        const data: any = {
            tenantId,
            categoryId: cleanCategoryId,
            month: parseInt(month, 10),
            year: parseInt(year, 10),
            deviationType: deviationType.trim(),
            description: description.trim(),
            correctionAction: correctionAction.trim(),
            responsibleId: responsibleId || null,
            responsibleName: responsibleName || null,
            dueDate: dueDate ? new Date(dueDate) : null,
            isResolved: !!isResolved
        };

        if (id) {
            const updated = await prisma.deviationAnalysis.update({
                where: { id },
                data,
                include: {
                    category: { select: { id: true, name: true } },
                    responsible: { select: { id: true, name: true, email: true, avatarUrl: true } }
                }
            });
            return NextResponse.json({ success: true, data: updated });
        } else {
            const created = await prisma.deviationAnalysis.create({
                data,
                include: {
                    category: { select: { id: true, name: true } },
                    responsible: { select: { id: true, name: true, email: true, avatarUrl: true } }
                }
            });
            return NextResponse.json({ success: true, data: created });
        }
    } catch (e: any) {
        console.error('[API DEVIATIONS POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'Parâmetro id é obrigatório' }, { status: 400 });
        }

        await prisma.deviationAnalysis.delete({
            where: { id }
        });

        return NextResponse.json({ success: true, message: 'Desvio deletado com sucesso' });
    } catch (e: any) {
        console.error('[API DEVIATIONS DELETE] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
