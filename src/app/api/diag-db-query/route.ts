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

        const parcelIds = ['9bbfc293-6f41-4913-b12f-76465c3a13a1', '9297cc52-342c-470a-8fe1-8e48a3fedf38'];
        const results = [];

        for (const pid of parcelIds) {
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${pid}`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            if (res.ok) {
                results.push(await res.json());
            } else {
                const text = await res.text();
                results.push({ id: pid, error: res.status, details: text });
            }
        }

        return NextResponse.json({
            success: true,
            results
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
