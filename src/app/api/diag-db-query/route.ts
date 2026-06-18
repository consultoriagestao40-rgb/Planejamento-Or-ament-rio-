import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function decodeJwt(token: string | null) {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = Buffer.from(parts[1], 'base64').toString('utf8');
        return JSON.parse(payload);
    } catch (e) {
        return null;
    }
}

export async function GET() {
    try {
        const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT FACILITIES
        const entries = await prisma.realizedEntry.findMany({
            where: { tenantId, year: 2026, month: 5, viewMode: 'competencia' }
        });
        
        const categories = await prisma.category.findMany();
        const catMap = new Map(categories.map(c => [c.id, c]));
        
        const groupSums: Record<string, number> = {};
        const catSums: Record<string, number> = {};
        
        for (const r of entries) {
            const cat = catMap.get(r.categoryId) || (r.categoryId.includes(':') ? catMap.get(r.categoryId.split(':')[1]) : null);
            const name = cat ? cat.name : 'Unknown';
            const match = name.match(/^([\d.]+)/);
            const code = match ? match[1] : '';
            let group = 'other';
            if (code.startsWith('01') || code === '1') group = '01';
            else if (code.startsWith('02') || code.startsWith('2')) group = '02';
            else if (code.startsWith('03') || code.startsWith('3')) group = '03';
            else if (code.startsWith('04') || code.startsWith('4')) group = '04';
            else if (code.startsWith('05') || code.startsWith('5')) group = '05';
            else if (code.startsWith('06') || code.startsWith('6')) group = '06';
            
            groupSums[group] = (groupSums[group] || 0) + r.amount;
            catSums[name] = (catSums[name] || 0) + r.amount;
        }
        
        return NextResponse.json({
            success: true,
            entriesCount: entries.length,
            realizedEntries: entries,
            categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type, entradaDre: c.entradaDre }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
