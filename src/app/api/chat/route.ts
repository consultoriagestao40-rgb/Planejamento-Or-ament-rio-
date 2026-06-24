import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { askVirtualCFO } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const sessionUser = token ? await verifyToken(token) : null;

        if (!sessionUser) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { actionType, tenantId } = body;

        // 1. Resolve & authorize Tenant ID
        let targetTenantId = tenantId;
        if (sessionUser.role === 'GESTOR') {
            const dbUser = await prisma.user.findUnique({
                where: { id: sessionUser.userId as string },
                include: {
                    tenantAccess: true,
                    costCenterAccess: {
                        include: { costCenter: true }
                    }
                }
            });
            if (!dbUser) {
                return NextResponse.json({ success: false, error: 'Usuário não encontrado' }, { status: 404 });
            }
            const allowedTenants = Array.from(new Set([
                ...dbUser.tenantAccess.map((t: any) => t.tenantId),
                ...dbUser.costCenterAccess.map((c: any) => c.costCenter.tenantId)
            ]));
            
            if (!targetTenantId || targetTenantId === 'all') {
                // Return all allowed tenants for consolidated group analysis
                targetTenantId = allowedTenants.join(',');
            } else {
                const requestedIds = targetTenantId.split(',').map((id: string) => id.trim()).filter(Boolean);
                const allAllowed = requestedIds.every((id: string) => allowedTenants.includes(id));
                if (!allAllowed) {
                    return NextResponse.json({ success: false, error: 'Acesso negado para um ou mais Tenants' }, { status: 403 });
                }
            }
        } else {
            // MASTER role can access any tenant
            if (!targetTenantId || targetTenantId === 'all') {
                const allTenants = await prisma.tenant.findMany({ select: { id: true } });
                targetTenantId = allTenants.map(t => t.id).join(',');
            }
        }

        if (!targetTenantId) {
            return NextResponse.json({ success: false, error: 'Nenhum Tenant disponível' }, { status: 400 });
        }

        // 2. Route request based on actionType
        if (actionType === 'CREATE_ACTION') {
            const { categoryId, month, year, description, actionText } = body;
            if (!categoryId || !month || !year || !description || !actionText) {
                return NextResponse.json({ success: false, error: 'Parâmetros de plano de ação incompletos' }, { status: 400 });
            }

            // If categoryId is consolidated (comma-separated), grab the first ID
            const firstCategoryId = categoryId.split(',')[0].trim();

            // Verify category exists
            const category = await prisma.category.findFirst({
                where: { id: firstCategoryId }
            });
            if (!category) {
                return NextResponse.json({ success: false, error: 'Categoria inválida ou não encontrada' }, { status: 400 });
            }

            // Create or update indicator analysis
            const analysis = await prisma.indicatorAnalysis.upsert({
                where: {
                    tenantId_categoryId_month_year: {
                        tenantId: category.tenantId, // write to the actual tenant that owns the category
                        categoryId: category.id,
                        month: parseInt(month, 10),
                        year: parseInt(year, 10)
                    }
                },
                update: {
                    deviationReport: description,
                    analysisPerformed: 'Análise realizada pelo CFO Virtual de IA'
                },
                create: {
                    tenantId: category.tenantId,
                    categoryId: category.id,
                    month: parseInt(month, 10),
                    year: parseInt(year, 10),
                    deviationReport: description,
                    analysisPerformed: 'Análise realizada pelo CFO Virtual de IA'
                }
            });

            // Create indicator action
            // Set due date to the end of that specific month
            const dueDate = new Date(parseInt(year, 10), parseInt(month, 10), 0);
            
            const action = await prisma.indicatorAction.create({
                data: {
                    analysisId: analysis.id,
                    description: actionText,
                    dueDate,
                    isDone: false
                }
            });

            return NextResponse.json({
                success: true,
                message: 'Plano de ação criado com sucesso',
                actionId: action.id
            });
        }

        // Default: Chat interaction
        const { messages } = body;
        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ success: false, error: 'Mensagens ausentes ou inválidas' }, { status: 400 });
        }

        const result = await askVirtualCFO(targetTenantId, messages);
        return NextResponse.json({
            success: true,
            text: result.text,
            suggestedAction: result.suggestedAction
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Erro interno no servidor' }, { status: 500 });
    }
}
