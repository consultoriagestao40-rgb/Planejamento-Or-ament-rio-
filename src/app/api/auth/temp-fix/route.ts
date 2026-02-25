import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const jvsId = "dc2b6eed-a38a-43c3-9465-ce854bfda90f";
        const spotId = "413f88a7-ce4a-4620-b044-43ef909b7b26";

        const jvsCat = await prisma.category.findFirst({ where: { name: "05.6.1 - Pró-labore", tenantId: jvsId } });
        const spotCat = await prisma.category.findFirst({ where: { name: "05.6.1 - Pró-labore", tenantId: spotId } });

        if (!jvsCat || !spotCat) {
            return NextResponse.json({ success: false, error: "Categories not found" });
        }

        // 1. Find all 8k entries in SPOT (Jan-Dec) for that category
        const spotEntries = await prisma.budgetEntry.findMany({
            where: { tenantId: spotId, categoryId: spotCat.id, amount: 8000 }
        });

        const fixResults = [];
        for (const entry of spotEntries) {
            // Find corresponding JVS entry for this month
            const existingJvs = await prisma.budgetEntry.findFirst({
                where: {
                    tenantId: jvsId,
                    categoryId: jvsCat.id,
                    month: entry.month,
                    year: entry.year,
                    costCenterId: entry.costCenterId
                }
            });

            if (existingJvs) {
                // Update JVS to 8k and delete the SPOT record
                await prisma.budgetEntry.update({
                    where: { id: existingJvs.id },
                    data: { amount: 8000 }
                });
                await prisma.budgetEntry.delete({ where: { id: entry.id } });
                fixResults.push({ month: entry.month, status: "Replaced JVS 8.5k with 8k and removed SPOT record" });
            } else {
                // Just move the SPOT record to JVS
                await prisma.budgetEntry.update({
                    where: { id: entry.id },
                    data: { tenantId: jvsId, categoryId: jvsCat.id }
                });
                fixResults.push({ month: entry.month, status: "Moved SPOT 8k record to JVS" });
            }
        }

        // 2. Extra safety: find any remaining 8.5k in JVS for that category and update them to 8k
        const remaining85k = await prisma.budgetEntry.findMany({
            where: { tenantId: jvsId, categoryId: jvsCat.id, amount: 8500 }
        });

        for (const r of remaining85k) {
            await prisma.budgetEntry.update({
                where: { id: r.id },
                data: { amount: 8000 }
            });
            fixResults.push({ month: r.month, status: "Changed remaining JVS 8.5k to 8k" });
        }

        return NextResponse.json({ success: true, processedSpot: spotEntries.length, processedJvsRemaining85k: remaining85k.length, fixResults });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
