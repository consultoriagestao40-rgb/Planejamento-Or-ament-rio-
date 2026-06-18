import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const costCenters = await prisma.costCenter.findMany({ 
            include: { tenant: { select: { name: true, taxRate: true } } },
            orderBy: { name: 'asc' } 
        });

        const normalizeName = (name: string) => 
            (name || '')
                .toLowerCase()
                .replace(/^\[inativo\]\s*/i, '')
                .replace(/^encerrado\s*/i, '')
                .replace(/^[\d. ]+-?\s*/, '')
                .replace(/[^a-z0-9]/g, '')
                .trim();

        const blacklist = ['CLEAN TECH', 'RIO NEGRINHO', 'REDE TONIN'];
        const map = new Map<string, any>();
        
        costCenters.forEach((cc: any) => {
            const originalName = (cc.name || '').toUpperCase();
            const nName = normalizeName(cc.name);
            const key = `${cc.tenantId}-${nName}`;
            
            const isWhiteListed = originalName.includes('CLEAN TECH PRO');
            const isBlacklisted = !isWhiteListed && (
                blacklist.some(b => originalName.includes(b)) || 
                originalName.includes('[INATIVO]') || 
                originalName.includes('ENCERRADO')
            );

            if (isBlacklisted) {
                return;
            }

            if (!map.has(key)) {
                const displayName = (cc.name || '')
                    .replace(/^\[INATIVO\]\s*/i, '')
                    .replace(/^ENCERRADO\s*/i, '')
                    .trim();

                map.set(key, {
                    id: cc.id,
                    name: displayName,
                    tenantId: cc.tenantId,
                    tenantName: cc.tenant?.name || 'Empresa Desconhecida',
                    taxRate: cc.tenant?.taxRate || 0
                });
            }
        });

        const resultCCs = Array.from(map.values()).filter(cc => cc.tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f');

        return NextResponse.json({
            success: true,
            costCenters: resultCCs
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
