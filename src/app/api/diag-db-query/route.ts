import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant) {
            return NextResponse.json({ success: false, error: 'Clean Tech Tenant not found' });
        }

        const { token } = await getValidAccessToken(tenant.id);

        const res1 = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/9bbfc293-6f41-4913-b12f-76465c3a13a1`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const p1 = res1.ok ? await res1.json() : { error: res1.status, body: await res1.text() };

        const res2 = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/9297cc52-342c-470a-8fe1-8e48a3fedf38`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const p2 = res2.ok ? await res2.json() : { error: res2.status, body: await res2.text() };

        // Also query the current entries for these two IDs
        const entries = await prisma.realizedEntry.findMany({
            where: {
                tenantId: tenant.id,
                externalId: {
                    in: [
                        'sync-1fa165e3-178f-4d8f-ae7c-434c720c82dd-9bbfc293-6f41-4913-b12f-76465c3a13a1-split-0-181bbe10-b34e-11f0-a457-93eb8a8ab1b0-competencia',
                        'sync-1fa165e3-178f-4d8f-ae7c-434c720c82dd-9bbfc293-6f41-4913-b12f-76465c3a13a1-split-dup-1-181bbe10-b34e-11f0-a457-93eb8a8ab1b0-competencia',
                        'sync-1fa165e3-178f-4d8f-ae7c-434c720c82dd-9297cc52-342c-470a-8fe1-8e48a3fedf38-split-0-181bbe10-b34e-11f0-a457-93eb8a8ab1b0-competencia',
                        'sync-1fa165e3-178f-4d8f-ae7c-434c720c82dd-9297cc52-342c-470a-8fe1-8e48a3fedf38-split-dup-1-181bbe10-b34e-11f0-a457-93eb8a8ab1b0-competencia'
                    ]
                }
            }
        });

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            p1,
            p2,
            entries
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
