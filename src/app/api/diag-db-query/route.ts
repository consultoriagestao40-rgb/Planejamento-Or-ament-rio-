import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'CLEAN TECH', mode: 'insensitive' } }
        });

        if (!tenant || !tenant.accessToken) {
            return NextResponse.json({ success: false, error: 'Tenant or token not found' });
        }

        const parcelId = 'f5540d13-505a-4dd7-a7cd-1c542cc01b9f';
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${parcelId}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
            cache: 'no-store'
        });

        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json({ success: false, status: res.status, error: text });
        }

        const data = await res.json();

        return NextResponse.json({
            success: true,
            tenant: { id: tenant.id, name: tenant.name },
            parcelDetails: data
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
