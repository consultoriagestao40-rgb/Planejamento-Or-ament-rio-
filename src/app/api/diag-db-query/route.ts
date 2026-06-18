import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const jvs = tenants.find(t => t.name.includes('JVS FACILITIES'));
        const spot = tenants.find(t => t.name.includes('SPOT FACILITIES'));
        
        return NextResponse.json({
            success: true,
            jvsToken: jvs ? jvs.accessToken : null,
            spotToken: spot ? spot.accessToken : null,
            tokensAreIdentical: (jvs && spot) ? jvs.accessToken === spot.accessToken : false,
            refreshAreIdentical: (jvs && spot) ? jvs.refreshToken === spot.refreshToken : false
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
