import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runCronSync } from '@/lib/cronSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
    try {
        // Step 1: Nuke all realized entries for 2026 to start clean
        const deleted = await prisma.realizedEntry.deleteMany({
            where: { year: 2026 }
        });
        
        // Step 2: Also 2025 just in case
        const deleted2025 = await prisma.realizedEntry.deleteMany({
            where: { year: 2025 }
        });
        
        return NextResponse.json({ 
            success: true, 
            message: 'All realized entries cleared. Now click "Sincronizar Agora" in the dashboard to rebuild.',
            deleted_2026: deleted.count,
            deleted_2025: deleted2025.count
        });
    } catch(e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
