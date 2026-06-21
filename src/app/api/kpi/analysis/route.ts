import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        const categoryId = searchParams.get('categoryId');
        const month = parseInt(searchParams.get('month') || '0', 10);
        const year = parseInt(searchParams.get('year') || '0', 10);

        if (!tenantId || !categoryId || !month || !year) {
            return NextResponse.json({ success: false, error: 'Parâmetros ausentes' }, { status: 400 });
        }

        const analysis = await prisma.indicatorAnalysis.findUnique({
            where: {
                tenantId_categoryId_month_year: {
                    tenantId,
                    categoryId,
                    month,
                    year
                }
            },
            include: {
                actions: {
                    orderBy: {
                        createdAt: 'asc'
                    }
                },
                comments: {
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });

        return NextResponse.json({ success: true, data: analysis });
    } catch (e: any) {
        console.error('[API ANALYSIS GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tenantId, categoryId, month, year, deviationReport, analysisPerformed, actions = [] } = body;

        if (!tenantId || !categoryId || !month || !year) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        // Upsert the main analysis record
        const analysis = await prisma.indicatorAnalysis.upsert({
            where: {
                tenantId_categoryId_month_year: {
                    tenantId,
                    categoryId,
                    month,
                    year
                }
            },
            update: {
                deviationReport: deviationReport || '',
                analysisPerformed: analysisPerformed || ''
            },
            create: {
                tenantId,
                categoryId,
                month,
                year,
                deviationReport: deviationReport || '',
                analysisPerformed: analysisPerformed || ''
            }
        });

        // Sync actions
        const receivedIds = actions.map((a: any) => a.id).filter(Boolean);

        // Delete actions that are not in the received payload
        await prisma.indicatorAction.deleteMany({
            where: {
                analysisId: analysis.id,
                id: { notIn: receivedIds }
            }
        });

        // Create or update received actions
        for (const action of actions) {
            if (action.id) {
                await prisma.indicatorAction.update({
                    where: { id: action.id },
                    data: {
                        description: action.description || '',
                        dueDate: new Date(action.dueDate),
                        isDone: !!action.isDone
                    }
                });
            } else {
                await prisma.indicatorAction.create({
                    data: {
                        analysisId: analysis.id,
                        description: action.description || '',
                        dueDate: new Date(action.dueDate),
                        isDone: !!action.isDone
                    }
                });
            }
        }

        // Fetch final state to return
        const updatedAnalysis = await prisma.indicatorAnalysis.findUnique({
            where: { id: analysis.id },
            include: {
                actions: { orderBy: { createdAt: 'asc' } },
                comments: { orderBy: { createdAt: 'asc' } }
            }
        });

        return NextResponse.json({ success: true, data: updatedAnalysis });
    } catch (e: any) {
        console.error('[API ANALYSIS POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
