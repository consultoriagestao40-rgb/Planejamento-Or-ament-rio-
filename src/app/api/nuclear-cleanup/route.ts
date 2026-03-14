
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantName = searchParams.get('name') || 'SPOT';
        const year = parseInt(searchParams.get('year') || '2026', 10);

        const tenants = await prisma.tenant.findMany({
            where: { name: { contains: tenantName, mode: 'insensitive' } }
        });

        if (tenants.length === 0) {
            return NextResponse.json({ success: false, error: `Nenhum tenant encontrado com o nome ${tenantName}` });
        }

        const tenantIds = tenants.map((t: any) => t.id);

        console.log(`[NUCLEAR] Cleaning up ${tenants.length} tenants: ${tenants.map((t: any) => t.name).join(', ')}`);

        // Delete realized entries
        const delRealized = await prisma.realizedEntry.deleteMany({
            where: { tenantId: { in: tenantIds }, year }
        });

        // Delete budget entries for the same year to be safe? 
        // User only complained about realized, but let's keep it safe.

        return NextResponse.json({
            success: true,
            message: `Limpeza concluída para ${tenantName} (${year})`,
            details: {
                tenantsAffected: tenants.length,
                realizedDeleted: delRealized.count
            }
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
