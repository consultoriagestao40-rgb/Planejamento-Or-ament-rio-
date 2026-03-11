import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('=== EMERGENCY JVS DIAGNOSTIC ===');
        
        // 1. Get ALL tenants that might be JVS
        const tenants = await prisma.tenant.findMany({
            where: { name: { contains: 'JVS', mode: 'insensitive' } },
            orderBy: { updatedAt: 'desc' }
        });

        const jvsData = [];

        for (const t of tenants) {
            // 2. Get all Realized Entries for this tenant in Jan 2026
            const entries = await prisma.realizedEntry.findMany({
                where: { 
                    tenantId: t.id, 
                    year: 2026, 
                    month: 0,
                    viewMode: 'competencia'
                },
                include: {
                    category: true
                }
            });

            // 3. Filter for Revenue (starts with 01 in name)
            const revenueEntries = entries.filter(e => {
                const name = e.category?.name || '';
                return name.startsWith('01');
            });

            const totalRevenue = revenueEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

            jvsData.push({
                tenantId: t.id,
                tenantName: t.name,
                cnpj: t.cnpj,
                updatedAt: t.updatedAt,
                entryCount: entries.length,
                revenueCount: revenueEntries.length,
                totalRevenueJan2026: totalRevenue,
                sampleRevenue: revenueEntries.slice(0, 3).map(e => ({
                    cat: e.category.name,
                    val: e.amount
                }))
            });
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            diagnostics: jvsData,
            combinedTotal: jvsData.reduce((acc, curr) => acc + curr.totalRevenueJan2026, 0),
            advice: "If combinedTotal is ~413k and individual totals are split, we need to pick the oldest ID and delete its entries."
        });

    } catch (e: any) {
        console.error('Diagnostic error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
