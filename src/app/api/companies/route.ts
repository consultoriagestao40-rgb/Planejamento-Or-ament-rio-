import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureTenantSchema } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await ensureTenantSchema();
        
        // Self-healing: Rename the fallback "Minha Empresa (Conta Azul)" to SPOT FACILITIES
        await prisma.tenant.updateMany({
            where: { name: { contains: 'Minha Empresa' } },
            data: { name: 'SPOT FACILITIES' }
        });

        const allTenants = await prisma.tenant.findMany({
            orderBy: { updatedAt: 'desc' }
        });

        const entityMap = new Map();
        const deduplicatedTenants = [];

        for (const t of allTenants) {
            const cleanName = (t.name || '').trim().toUpperCase();
            const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
            const key = cleanCnpj || cleanName;
            
            if (!entityMap.has(key)) {
                entityMap.set(key, t.id);
                deduplicatedTenants.push(t);
            }
        }

        return NextResponse.json({ success: true, companies: deduplicatedTenants });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
