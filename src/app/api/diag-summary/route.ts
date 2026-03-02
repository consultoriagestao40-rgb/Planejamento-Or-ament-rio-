import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ccs = await prisma.costCenter.findMany({
            where: {
                name: { contains: 'AMERICA', mode: 'insensitive' }
            }
        });

        const results = [];
        const currentYear = new Date().getFullYear();

        for (const cc of ccs) {
            const entries = await prisma.budgetEntry.findMany({
                where: { costCenterId: cc.id, year: currentYear },
                include: { category: true }
            });

            results.push({
                cc: cc.name,
                ccId: cc.id,
                entryCount: entries.length,
                entries: entries.map(e => ({
                    amount: e.amount,
                    cat: e.category.name,
                    catType: e.category.type,
                    catId: e.categoryId
                }))
            });
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
