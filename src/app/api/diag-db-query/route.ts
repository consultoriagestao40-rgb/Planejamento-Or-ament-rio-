import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const results = [];
        
        for (const t of tenants) {
            const entries = await prisma.realizedEntry.findMany({
                where: { tenantId: t.id, year: 2026, month: 5, viewMode: 'competencia' }
            });
            
            const categories = await prisma.category.findMany({
                where: { tenantId: t.id }
            });
            const catMap = new Map(categories.map(c => [c.id, c]));
            
            const groupSums: Record<string, number> = {};
            for (const r of entries) {
                const cat = catMap.get(r.categoryId) || (r.categoryId.includes(':') ? catMap.get(r.categoryId.split(':')[1]) : null);
                const name = cat ? cat.name : 'Unknown';
                const match = name.match(/^([\d.]+)/);
                const code = match ? match[1] : '';
                let group = 'other';
                if (code.startsWith('01') || code === '1') group = '01';
                else if (code.startsWith('02') || code.startsWith('2')) group = '02';
                else if (code.startsWith('03') || code.startsWith('3')) group = '03';
                else if (code.startsWith('04') || code.startsWith('04')) group = '04';
                else if (code.startsWith('05') || code.startsWith('5')) group = '05';
                else if (code.startsWith('06') || code.startsWith('6')) group = '06';
                
                groupSums[group] = (groupSums[group] || 0) + r.amount;
            }
            
            results.push({
                tenantId: t.id,
                tenantName: t.name,
                tokenEqualsJvs: t.accessToken === tenants.find(x => x.name.includes('JVS FACILITIES'))?.accessToken,
                entriesCount: entries.length,
                groupSums
            });
        }
        
        return NextResponse.json({
            success: true,
            results
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
