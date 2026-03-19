
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runCronSync } from '@/lib/cronSync';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const audit = async () => {
        for (const t of tenants) {
            const spotEntries = await prisma.realizedEntry.findMany({
                where: { tenantId: t.id, year: 2026, month: 1 }
            });
            
            let compRev = 0, compExp = 0, caiRev = 0, caiExp = 0;
            spotEntries.forEach(e => {
                if (e.viewMode === 'competencia') {
                    if (e.amount > 0) compRev += e.amount; else compExp += Math.abs(e.amount);
                } else {
                    if (e.amount > 0) caiRev += e.amount; else caiExp += Math.abs(e.amount);
                }
            });
            
            parityMap[t.name] = {
                competencia: { revenue: compRev, expenses: compExp },
                caixa: { revenue: caiRev, expenses: caiExp }
            };
        }

        return NextResponse.json({ 
            ok: true, 
            timestamp: new Date().toISOString(), 
            status: "Full Diagnostic v0.9.82", 
            report, // NEW: Full engine report including errors and counts
            parity: parityMap 
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
    }
}
```
