import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('=== NUCLEAR CLEANUP START ===');
        const allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
        
        const entityGroups = new Map<string, any[]>();
        for (const t of allTenants) {
            const key = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!entityGroups.has(key)) entityGroups.set(key, []);
            entityGroups.get(key)!.push(t);
        }

        const report = [];

        for (const [key, tenants] of entityGroups.entries()) {
            if (tenants.length <= 1) continue;

            const primary = tenants[0]; // Most recently updated is master
            const fallbacks = tenants.slice(1);
            const fallbackIds = fallbacks.map(f => f.id);

            console.log(`Cleaning Entity: ${primary.name}. Primary: ${primary.id}. Orphans: ${fallbackIds.length}`);

            // Delete ALL realized data from orphan IDs to prevent the R$ 127k ghost issue
            const deleteCount = await prisma.realizedEntry.deleteMany({
                where: { tenantId: { in: fallbackIds } }
            });

            report.push({
                entity: primary.name,
                primaryId: primary.id,
                orphansCleaned: fallbackIds.length,
                entriesDeleted: deleteCount.count
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Database stabilized. Orphans deleted.',
            report
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
