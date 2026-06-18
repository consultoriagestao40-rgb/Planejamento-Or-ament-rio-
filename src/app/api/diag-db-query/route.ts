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
        const jvsId = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f';
        const spotId = '413f88a7-ce4a-4620-b044-43ef909b7b26';
        
        const jvs = await prisma.tenant.findUnique({ where: { id: jvsId } });
        const spot = await prisma.tenant.findUnique({ where: { id: spotId } });
        
        if (!jvs || !spot) {
            return NextResponse.json({ success: false, error: "JVS or Spot tenant not found" });
        }
        
        // Swap tokens
        await prisma.tenant.update({
            where: { id: jvsId },
            data: {
                accessToken: spot.accessToken,
                refreshToken: spot.refreshToken,
                tokenExpiresAt: spot.tokenExpiresAt
            }
        });
        
        await prisma.tenant.update({
            where: { id: spotId },
            data: {
                accessToken: jvs.accessToken,
                refreshToken: jvs.refreshToken,
                tokenExpiresAt: jvs.tokenExpiresAt
            }
        });
        
        // Delete all sync- realized entries for both for May 2026 to force clean sync
        const delJvs = await prisma.realizedEntry.deleteMany({
            where: {
                tenantId: jvsId,
                year: 2026,
                month: 5,
                externalId: { startsWith: 'sync-' }
            }
        });
        
        const delSpot = await prisma.realizedEntry.deleteMany({
            where: {
                tenantId: spotId,
                year: 2026,
                month: 5,
                externalId: { startsWith: 'sync-' }
            }
        });
        
        return NextResponse.json({
            success: true,
            swapped: true,
            delJvsCount: delJvs.count,
            delSpotCount: delSpot.count
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
