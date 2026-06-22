import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action') || 'list-tenants';

        if (action === 'list-tenants') {
            const tenants = await prisma.tenant.findMany({
                select: {
                    id: true,
                    name: true,
                    cnpj: true,
                    accessToken: true, 
                    tokenExpiresAt: true
                }
            });
            return NextResponse.json({
                success: true,
                tenants: tenants.map(t => ({
                    id: t.id,
                    name: t.name,
                    cnpj: t.cnpj,
                    hasToken: !!t.accessToken,
                    tokenExpiresAt: t.tokenExpiresAt
                }))
            });
        }

        if (action === 'list-bank-accounts') {
            const accounts = await prisma.bankAccount.findMany({
                include: { tenant: { select: { name: true } } }
            });
            return NextResponse.json({ success: true, accounts });
        }

        if (action === 'query-sql') {
            const sql = searchParams.get('sql') || 'SELECT 1';
            if (!sql.toUpperCase().trim().startsWith('SELECT')) {
                return NextResponse.json({ success: false, error: 'Only SELECT queries are allowed for safety.' }, { status: 400 });
            }
            const result = await prisma.$queryRawUnsafe(sql);
            return NextResponse.json({ success: true, result });
        }

        if (action === 'run-prisma-test') {
            const tenantIdParam = 'ALL';
            const month = 1; // Feb
            const year = 2026;
            const viewMode = 'competencia';

            const allTenants = await prisma.tenant.findMany({ select: { id: true } });
            const targetTenantIds = allTenants.map(t => t.id);

            const syncedTenants = await prisma.realizedEntry.findMany({
                where: {
                    tenantId: { in: targetTenantIds },
                    year,
                    month: month + 1,
                    viewMode,
                    externalId: { startsWith: 'sync-' }
                },
                select: { tenantId: true },
                distinct: ['tenantId']
            });

            return NextResponse.json({
                success: true,
                syncedTenants,
                targetTenantIds
            });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
