import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await ensureTenantSchema();
        const tenant = await prisma.tenant.findFirst({
            where: {
                name: { contains: 'JVS', mode: 'insensitive' }
            }
        });

        if (!tenant) {
            return NextResponse.json({ error: 'JVS Tenant não encontrado' });
        }

        const categories = await prisma.category.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, name: true, type: true }
        });

        const dasCats = categories.filter(c => c.name.toLowerCase().includes('simples nacional') || c.name.toLowerCase().includes('das') || c.name.includes('2.1.1'));
        const vendaCats = categories.filter(c => c.name.toLowerCase().includes('venda'));

        return NextResponse.json({
            tenantId: tenant.id,
            dasCategories: dasCats,
            vendaCategories: vendaCats
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
