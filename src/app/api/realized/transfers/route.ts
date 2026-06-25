import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            sourceTenantId,
            targetTenantId,
            amount,
            month,
            year,
            description,
            viewMode = 'competencia'
        } = body;

        if (!sourceTenantId || !targetTenantId || amount === undefined || !month || !year) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        const numericAmount = parseFloat(String(amount));
        const monthNum = parseInt(String(month), 10);
        const yearNum = parseInt(String(year), 10);

        if (isNaN(numericAmount) || numericAmount <= 0) {
            return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
        }

        if (sourceTenantId === targetTenantId) {
            return NextResponse.json({ success: false, error: 'Source and target companies must be different' }, { status: 400 });
        }

        // Resolvendo os nomes dos tenants para a descrição estruturada
        const [sourceTenant, targetTenant] = await Promise.all([
            prisma.tenant.findUnique({ where: { id: sourceTenantId }, select: { name: true } }),
            prisma.tenant.findUnique({ where: { id: targetTenantId }, select: { name: true } })
        ]);

        const sourceName = sourceTenant?.name || 'Empresa de Origem';
        const targetName = targetTenant?.name || 'Empresa de Destino';

        const transferUuid = crypto.randomUUID();

        const parentSourceId = `${sourceTenantId}:custos-transferidos-pai`;
        const parentTargetId = `${targetTenantId}:custos-transferidos-pai`;
        const saidasId = `${sourceTenantId}:custos-transferidos-saidas`;
        const entradasId = `${targetTenantId}:custos-transferidos-entradas`;

        // 1. Garantir que as categorias gerenciais existam no banco para ambos os lados
        await Promise.all([
            prisma.category.upsert({
                where: { id: parentSourceId },
                update: {},
                create: { id: parentSourceId, name: '03.10 - Custos Transferidos', tenantId: sourceTenantId, type: 'EXPENSE', entradaDre: 'DESPESAS_OPERACIONAIS' }
            }),
            prisma.category.upsert({
                where: { id: parentTargetId },
                update: {},
                create: { id: parentTargetId, name: '03.10 - Custos Transferidos', tenantId: targetTenantId, type: 'EXPENSE', entradaDre: 'DESPESAS_OPERACIONAIS' }
            }),
            prisma.category.upsert({
                where: { id: saidasId },
                update: {},
                create: { id: saidasId, name: '03.10.1 - Custos Transferidos saídas', tenantId: sourceTenantId, parentId: parentSourceId, type: 'EXPENSE', entradaDre: 'DESPESAS_OPERACIONAIS' }
            }),
            prisma.category.upsert({
                where: { id: entradasId },
                update: {},
                create: { id: entradasId, name: '03.10.2 - Custos Transferidos entradas', tenantId: targetTenantId, parentId: parentTargetId, type: 'EXPENSE', entradaDre: 'DESPESAS_OPERACIONAIS' }
            })
        ]);

        const date = new Date(yearNum, monthNum - 1, 1);
        const reasonText = (description || '').trim();

        // Montando a descrição padronizada com a justificativa
        const composedDescription = `Transferência Gerencial | De: ${sourceName} para: ${targetName}${reasonText ? ` | Justificativa: ${reasonText}` : ''}`;

        // Executando em transação para garantir integridade e atomicidade
        const result = await prisma.$transaction(async (tx) => {
            // Lançamento de saída (negativo) na empresa de origem
            const outEntry = await tx.realizedEntry.create({
                data: {
                    externalId: `transf-out-${transferUuid}`,
                    viewMode,
                    tenantId: sourceTenantId,
                    amount: -Math.abs(numericAmount),
                    categoryId: saidasId,
                    costCenterId: null,
                    month: monthNum,
                    year: yearNum,
                    date,
                    description: `[Saída Transferida] ${composedDescription}`.trim()
                }
            });

            // Lançamento de entrada (positivo) na empresa de destino
            const inEntry = await tx.realizedEntry.create({
                data: {
                    externalId: `transf-in-${transferUuid}`,
                    viewMode,
                    tenantId: targetTenantId,
                    amount: Math.abs(numericAmount),
                    categoryId: entradasId,
                    costCenterId: null,
                    month: monthNum,
                    year: yearNum,
                    date,
                    description: `[Entrada Transferida] ${composedDescription}`.trim()
                }
            });

            return { outEntry, inEntry };
        });

        return NextResponse.json({ success: true, data: result });

    } catch (error: any) {
        console.error('Error creating transfer adjustment:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const transferUuid = searchParams.get('transferUuid');
        const viewMode = searchParams.get('viewMode') || 'competencia';

        if (!transferUuid) {
            return NextResponse.json({ success: false, error: 'Missing transferUuid' }, { status: 400 });
        }

        const targetExternalIds = [
            `transf-out-${transferUuid}`,
            `transf-in-${transferUuid}`
        ];

        // Deleta ambas as pontas da transferência simultaneamente
        const deleted = await prisma.realizedEntry.deleteMany({
            where: {
                viewMode,
                externalId: { in: targetExternalIds }
            }
        });

        return NextResponse.json({ success: true, count: deleted.count });

    } catch (error: any) {
        console.error('Error deleting transfer adjustment:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
