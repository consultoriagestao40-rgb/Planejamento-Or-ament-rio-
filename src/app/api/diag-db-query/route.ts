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

        const p1PurchaseId = 'dc7860d4-95a2-47eb-bd16-780613b2ac77'; // Fatura 117 purchase
        const p2PurchaseId = 'a01028b8-7c92-4957-9776-d38209933ce4'; // Fatura 113 purchase

        const p1PurchaseRes = await fetch(`https://api-v2.contaazul.com/v1/compras/${p1PurchaseId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const p1Purchase = p1PurchaseRes.ok ? await p1PurchaseRes.json() : { error: `Status ${p1PurchaseRes.status}` };

        const p2PurchaseRes = await fetch(`https://api-v2.contaazul.com/v1/compras/${p2PurchaseId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const p2Purchase = p2PurchaseRes.ok ? await p2PurchaseRes.json() : { error: `Status ${p2PurchaseRes.status}` };

        return NextResponse.json({
            success: true,
            p1Purchase,
            p2Purchase
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
