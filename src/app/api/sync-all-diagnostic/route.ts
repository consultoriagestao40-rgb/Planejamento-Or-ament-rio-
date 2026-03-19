import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runCronSync } from '@/lib/cronSync';

export async function GET() {
    try {
        const results = await runCronSync(2026);
        
        const parityMap: any = {};
        const tenants = await prisma.tenant.findMany();
        
        for (const t of tenants) {
            const entries = await prisma.realizedEntry.findMany({
                where: { tenantId: t.id, year: 2026, month: 1 }
            });
            
            let compRev = 0, compExp = 0, caiRev = 0, caiExp = 0;
            entries.forEach(e => {
                const isRev = e.amount > 0;
                const val = Math.abs(e.amount);
                if (e.viewMode === 'competencia') {
                    if (isRev) compRev += val; else compExp += val;
                } else {
                    if (isRev) caiRev += val; else caiExp += val;
                }
            });
            
            parityMap[t.name] = {
                competencia: { revenue: compRev, expenses: compExp },
                caixa: { revenue: caiRev, expenses: caiExp }
            };
        }

        return NextResponse.json({ 
            ok: true, 
            version: '0.9.85',
            results, 
            parity: parityMap 
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
