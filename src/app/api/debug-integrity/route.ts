import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT FACILITIES
        
        // 1. Check for duplicate Cost Centers
        const ccs = await prisma.costCenter.findMany({ where: { tenantId } });
        const ccNames = new Map<string, string[]>();
        ccs.forEach(cc => {
            const list = ccNames.get(cc.name) || [];
            list.push(cc.id);
            ccNames.set(cc.name, list);
        });
        
        const ccDuplicates = [];
        ccNames.forEach((ids, name) => {
            if (ids.length > 1) ccDuplicates.push({ name, ids });
        });
        
        // 2. Check for Physical Duplicates in RealizedEntry
        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId, year: 2026, month: 0, viewMode: 'competencia' },
            include: { category: true, costCenter: true }
        });
        
        const dupCheck = new Map<string, any[]>();
        entries.forEach(e => {
            const key = `${e.categoryId || 'null'}|${e.costCenterId || 'null'}|${e.month}|${e.viewMode}`;
            const list = dupCheck.get(key) || [];
            list.push({ id: e.id, amount: e.amount, cc: e.costCenter?.name, cat: e.category?.name });
            dupCheck.set(key, list);
        });
        
        const duplicates = [];
        dupCheck.forEach((list, key) => {
            if (list.length > 1) {
                duplicates.push({ key, count: list.length, items: list });
            }
        });

        // 3. Overall stats
        const stats = {
            totalEntriesInMonth: entries.length,
            sumOfAllEntries: entries.reduce((acc, curr) => acc + curr.amount, 0),
            duplicateGroupsFound: duplicates.length
        };
        
        return NextResponse.json({ success: true, stats, ccDuplicates, duplicates });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
