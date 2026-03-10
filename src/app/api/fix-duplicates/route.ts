import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const allTenants = await prisma.tenant.findMany({
            orderBy: { updatedAt: 'desc' }
        });

        const seenNames = new Set();
        const toDeleteIds: string[] = [];
        const keptTenants: any[] = [];

        for (const t of allTenants) {
            if (seenNames.has(t.name)) {
                toDeleteIds.push(t.id);
            } else {
                seenNames.add(t.name);
                keptTenants.push(t);
            }
        }

        if (toDeleteIds.length > 0) {
            // Delete associated entries first if needed, though most should cascade or be unique to the tenantId
            // In our schema, we should check what needs manual cleanup. 
            // BudgetEntry, RealizedEntry have tenantId as a field.
            
            await prisma.realizedEntry.deleteMany({ where: { tenantId: { in: toDeleteIds } } });
            await prisma.budgetEntry.deleteMany({ where: { tenantId: { in: toDeleteIds } } });
            await prisma.tenant.deleteMany({ where: { id: { in: toDeleteIds } } });
        }

        return NextResponse.json({ 
            success: true, 
            deletedCount: toDeleteIds.length, 
            kept: keptTenants.map(t => t.name) 
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
