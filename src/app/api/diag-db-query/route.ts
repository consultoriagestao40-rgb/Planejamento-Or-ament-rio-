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

        const p1Id = '9bbfc293-6f41-4913-b12f-76465c3a13a1'; // Fatura 117
        const p2Id = '9297cc52-342c-470a-8fe1-8e48a3fedf38'; // Fatura 113

        const p1Res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${p1Id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const p1 = p1Res.ok ? await p1Res.json() : { error: `Status ${p1Res.status}` };

        const p2Res = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${p2Id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const p2 = p2Res.ok ? await p2Res.json() : { error: `Status ${p2Res.status}` };

        return NextResponse.json({
            success: true,
            p1,
            p2
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
