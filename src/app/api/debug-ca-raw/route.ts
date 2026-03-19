import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const spotId = '413f88a7-ce4a-4620-b044-43ef909b7b26';
    try {
        const tenant = await prisma.tenant.findUnique({ where: { id: spotId } });
        if (!tenant || !tenant.accessToken) return NextResponse.json({ ok: false, error: 'No token' });
        
        const url = `https://api-v2.contaazul.com/v1/vendas/buscar?data_inicio=2026-01-01&data_fim=2026-01-31`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${tenant.accessToken}` } });
        const data = await res.json();
        
        return NextResponse.json({ ok: true, url, status: res.status, data });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
