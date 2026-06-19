import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const cleanTech = tenants.find(t => t.name.toUpperCase().includes('CLEAN TECH'));
        if (!cleanTech) {
            return NextResponse.json({ success: false, error: 'Clean Tech not found' });
        }

        const { token } = await getValidAccessToken(cleanTech.id);

        const recId = 'f5540d13-505a-4dd7-a7cd-1c542cc01b9f';
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/${recId}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        const data = res.ok ? await res.json() : { error: true, details: await res.text() };

        return NextResponse.json({
            success: true,
            detailedReceivable: data
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
