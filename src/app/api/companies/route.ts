import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {

        const allTenants = await prisma.tenant.findMany({
            select: { id: true, name: true, cnpj: true },
            orderBy: { name: 'asc' }
        });

        const entityMap = new Map();
        const deduplicatedTenants = [];

        for (const t of allTenants) {
            const key = (t.cnpj || t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            
            if (!entityMap.has(key)) {
                entityMap.set(key, t.id);
                deduplicatedTenants.push({ id: t.id, name: t.name });
            }
        }

        return NextResponse.json({ success: true, companies: deduplicatedTenants });
    } catch (e: any) {
        console.error("[COMPANIES API] Error:", e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
