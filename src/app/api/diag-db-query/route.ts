import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS Tratamentos

        // Fetch realized entries for May 2026 in competency mode
        const realizedEntries = await prisma.realizedEntry.findMany({
            where: { tenantId, year: 2026, month: 5, viewMode: 'competencia' },
            include: {
                category: {
                    select: {
                        name: true,
                        entradaDre: true
                    }
                }
            }
        });

        let totalG3 = 0;
        const g3Items = [];
        for (const e of realizedEntries) {
            const catName = e.category?.name || '';
            if (catName.startsWith('03.')) {
                totalG3 += e.amount;
                g3Items.push({
                    category: catName,
                    amount: e.amount,
                    description: e.description,
                    externalId: e.externalId
                });
            }
        }

        return NextResponse.json({
            success: true,
            tenantId,
            realizedEntriesCount: realizedEntries.length,
            totalG3,
            g3ItemsCount: g3Items.length,
            g3Items: g3Items.sort((a, b) => b.amount - a.amount)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}

